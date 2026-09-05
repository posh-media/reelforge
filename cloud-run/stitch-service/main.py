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
