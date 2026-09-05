import os
import pathlib
import subprocess
import tempfile
from typing import List

import requests
from fastapi import FastAPI, HTTPException
from google.cloud import storage
from pydantic import BaseModel

app = FastAPI()
client = storage.Client()


class StitchRequest(BaseModel):
    userId: str
    projectId: str
    scenePaths: List[str]
    outputPath: str


def _bucket_name() -> str:
    return os.environ.get(
        'STORAGE_BUCKET',
        f"{os.environ.get('GOOGLE_CLOUD_PROJECT', '')}.appspot.com",
    )


def _download_to_temp(bucket, path: str, dest_dir: str) -> str:
    blob = bucket.blob(path)
    ext = pathlib.Path(path).suffix or '.mp4'
    dest = os.path.join(dest_dir, f'input_{len(os.listdir(dest_dir))}{ext}')
    blob.download_to_filename(dest)
    return dest


@app.post('/stitch')
async def stitch(req: StitchRequest):
    try:
        bucket = client.bucket(_bucket_name())

        with tempfile.TemporaryDirectory() as tmpdir:
            if not req.scenePaths:
                raise HTTPException(status_code=400, detail='No scenes to stitch')

            input_files = [_download_to_temp(bucket, p, tmpdir) for p in req.scenePaths]

            concat_path = os.path.join(tmpdir, 'concat.txt')
            with open(concat_path, 'w') as f:
                for inp in input_files:
                    f.write(f"file '{os.path.basename(inp)}'\n")

            output_path = os.path.join(tmpdir, 'output.mp4')

            # Attempt fast stream copy first; re-encode if codecs disagree.
            try:
                subprocess.run(
                    [
                        'ffmpeg',
                        '-y',
                        '-f',
                        'concat',
                        '-safe',
                        '0',
                        '-i',
                        concat_path,
                        '-c',
                        'copy',
                        output_path,
                    ],
                    check=True,
                    cwd=tmpdir,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                )
            except subprocess.CalledProcessError:
                subprocess.run(
                    [
                        'ffmpeg',
                        '-y',
                        '-f',
                        'concat',
                        '-safe',
                        '0',
                        '-i',
                        concat_path,
                        '-c:v',
                        'libx264',
                        '-preset',
                        'fast',
                        '-crf',
                        '23',
                        '-c:a',
                        'aac',
                        '-b:a',
                        '128k',
                        output_path,
                    ],
                    check=True,
                    cwd=tmpdir,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                )

            out_blob = bucket.blob(req.outputPath)
            out_blob.upload_from_filename(output_path, content_type='video/mp4')

            return {'finalVideoUrl': req.outputPath}
    except subprocess.CalledProcessError as e:
        raise HTTPException(
            status_code=500,
            detail=f"ffmpeg failed: {e.stderr.decode() if e.stderr else str(e)}",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class UploadRequest(BaseModel):
    userId: str
    projectId: str
    storagePath: str
    accessToken: str
    metadata: dict


YOUTUBE_UPLOAD_ENDPOINT = 'https://upload.youtube.com/youtube/v3/videos'
CHUNK_SIZE = 5 * 1024 * 1024


def _download_media_to_temp(bucket, path: str, dest_dir: str) -> str:
    blob = bucket.blob(path)
    dest = os.path.join(dest_dir, 'media.mp4')
    blob.download_to_filename(dest)
    return dest


def _resumable_upload_video(file_path: str, access_token: str, body: dict) -> dict:
    file_size = os.path.getsize(file_path)
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': 'video/mp4',
        'X-Upload-Content-Length': str(file_size),
    }
    res = requests.post(
        f'{YOUTUBE_UPLOAD_ENDPOINT}?uploadType=resumable&part=snippet,status',
        headers=headers,
        json=body,
        timeout=60,
    )
    if res.status_code not in (200, 201):
        raise Exception(f'Failed to start YouTube resumable session: {res.status_code} {res.text}')

    upload_url = res.headers.get('Location')
    if not upload_url:
        raise Exception('No Location header returned for resumable upload')

    with open(file_path, 'rb') as f:
        start = 0
        while start < file_size:
            end = min(start + CHUNK_SIZE - 1, file_size - 1)
            chunk = f.read(end - start + 1)
            chunk_headers = {
                'Content-Length': str(len(chunk)),
                'Content-Range': f'bytes {start}-{end}/{file_size}',
            }
            chunk_res = requests.put(upload_url, headers=chunk_headers, data=chunk, timeout=120)
            if chunk_res.status_code in (200, 201):
                return chunk_res.json()
            if chunk_res.status_code == 308:
                range_header = chunk_res.headers.get('Range')
                if range_header:
                    start = int(range_header.split('-')[1]) + 1
                else:
                    start = end + 1
                continue
            raise Exception(f'Chunk upload failed: {chunk_res.status_code} {chunk_res.text}')

    raise Exception('Upload ended without a 200/201 response')


def _upload_video(file_path: str, access_token: str, metadata: dict, requested_visibility: str):
    body = {
        'snippet': {
            'title': metadata.get('title'),
            'description': metadata.get('description', ''),
            'tags': metadata.get('tags', []),
        },
        'status': {
            'privacyStatus': requested_visibility,
        },
    }
    try:
        result = _resumable_upload_video(file_path, access_token, body)
        return result, requested_visibility, False
    except Exception:
        if requested_visibility != 'private':
            try:
                body['status']['privacyStatus'] = 'private'
                result = _resumable_upload_video(file_path, access_token, body)
                return result, 'private', True
            except Exception:
                pass
        raise


@app.post('/upload')
async def upload(req: UploadRequest):
    try:
        bucket = client.bucket(_bucket_name())
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = _download_media_to_temp(bucket, req.storagePath, tmpdir)
            requested_visibility = req.metadata.get('privacyStatus', 'private')
            result, final_visibility, downgraded = _upload_video(
                file_path, req.accessToken, req.metadata, requested_visibility
            )
            video_id = result.get('id')
            if not video_id:
                raise HTTPException(status_code=500, detail='YouTube did not return a video id')
            return {'videoId': video_id, 'visibility': final_visibility, 'downgraded': downgraded}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
