import type { Project, User } from '../types';

export const mockUser: User = {
  id: 'user-1',
  name: 'Alex Rivers',
  email: 'alex@reelforge.studio',
};

export const mockProjects: Project[] = [
  {
    id: 'proj-1',
    title: 'The Last Lighthouse Keeper',
    genre: 'Drama',
    generationMode: 'single_story',
    targetDurationSeconds: 300,
    videoModel: 'seedance',
    status: 'uploaded',
    createdAt: '2026-08-28T14:30:00Z',
    updatedAt: '2026-09-01T09:15:00Z',
    idea:
      'A reclusive lighthouse keeper discovers a message in a bottle that predicts the next three storms — and the last one will sink the island.',
    characters: [
      { name: 'Elias', description: 'A reclusive lighthouse keeper in his sixties, taciturn and weather-beaten.' },
    ],
    scenes: [
      {
        id: 'scene-1-1',
        order: 1,
        script:
          'The beam cut across the black water in its endless rotation. Elias had kept this light for forty years, and in that time he had learned that the sea does not warn; it only waits.',
        status: 'approved',
        characterNames: ['Elias'],
        durationSeconds: 45,
      },
      {
        id: 'scene-1-2',
        order: 2,
        script:
          'Tonight, the glass in his hand was not from the supply crate. It had washed up against the rocks at dawn, sealed with red wax, and inside was a single page written in a hand he almost recognized.',
        status: 'approved',
        characterNames: ['Elias'],
        durationSeconds: 55,
      },
      {
        id: 'scene-1-3',
        order: 3,
        script:
          '"Three lights will fail," it read. "The third will take the island." He did not believe in prophecy. But he believed in tide, and in pressure, and in the bruised color of the clouds gathering beyond the harbor mouth. He struck a match, lit the lamp, and began to count.',
        status: 'approved',
        characterNames: ['Elias'],
        durationSeconds: 60,
      },
    ],
  },
  {
    id: 'proj-2',
    title: 'Echoes of Ashwood',
    genre: 'Drama',
    generationMode: 'single_story',
    targetDurationSeconds: 300,
    videoModel: 'kling',
    status: 'approved',
    createdAt: '2026-08-25T10:00:00Z',
    updatedAt: '2026-08-30T16:45:00Z',
    idea:
      'Two estranged siblings return to their childhood forest to scatter their father’s ashes and hear the trees repeat their arguments back to them.',
    characters: [
      { name: 'Maya', description: 'The older sibling, pragmatic, carrying the urn.' },
      { name: 'Daniel', description: 'The younger sibling, quiet, reluctant to be here.' },
    ],
    scenes: [
      {
        id: 'scene-2-1',
        order: 1,
        script:
          'The trail had not changed in twenty years, only narrowed. Maya walked ahead with the urn cradled inside her jacket; Daniel followed with his headphones around his neck, silent for once.',
        status: 'approved',
        characterNames: ['Maya', 'Daniel'],
        durationSeconds: 50,
      },
      {
        id: 'scene-2-2',
        order: 2,
        script:
          'At the split oak they stopped. The wind moved through the leaves in a rhythm too regular to be accidental. "You always had to be first," the forest said, in Daniel’s voice.',
        status: 'approved',
        characterNames: ['Maya', 'Daniel'],
        durationSeconds: 55,
      },
      {
        id: 'scene-2-3',
        order: 3,
        script:
          '"You never let me finish a sentence," it answered, in Maya’s. They looked at each other. The ashes were still warm through the ceramic.',
        status: 'approved',
        characterNames: ['Maya', 'Daniel'],
        durationSeconds: 60,
      },
      {
        id: 'scene-2-4',
        order: 4,
        script:
          'Maya unscrewed the lid. Daniel took off his headphones. The wind stopped. They scattered the ashes together, and for a moment the forest had nothing left to say.',
        status: 'approved',
        characterNames: ['Maya', 'Daniel'],
        durationSeconds: 45,
      },
    ],
  },
  {
    id: 'proj-3',
    title: 'Whispers in the Static',
    genre: 'Horror',
    generationMode: 'single_story',
    targetDurationSeconds: 300,
    videoModel: 'veo',
    status: 'pending_review',
    createdAt: '2026-08-20T18:20:00Z',
    updatedAt: '2026-08-31T11:00:00Z',
    idea:
      'A late-night radio host realizes the voices calling in are not live — they are broadcasts from the future, and tonight they are warning about her.',
    characters: [
      { name: 'Nina', description: 'A late-night radio host, tired, sharp, and increasingly frightened.' },
    ],
    scenes: [
      {
        id: 'scene-3-1',
        order: 1,
        script:
          'The switchboard lit up at 3:13 a.m., which was unusual because Nina’s show ended at three. She let the first call roll to dead air, then the second, then the third.',
        status: 'approved',
        characterNames: ['Nina'],
        durationSeconds: 45,
      },
      {
        id: 'scene-3-2',
        order: 2,
        script:
          'On the fourth, she answered. "Don’t look out the window," the caller said. It was her own voice, but older, hoarse, terrified.',
        status: 'approved',
        characterNames: ['Nina'],
        durationSeconds: 40,
      },
      {
        id: 'scene-3-3',
        order: 3,
        script:
          'The studio had no windows. Nina knew that. But her apartment, six floors up, had a view of the street she had left dark when she went to bed.',
        status: 'approved',
        characterNames: ['Nina'],
        durationSeconds: 50,
      },
      {
        id: 'scene-3-4',
        order: 4,
        script:
          '"He’s already inside," the future Nina whispered. "Run." The line went dead. The studio monitor hissed. In the static, something breathed.',
        status: 'approved',
        characterNames: ['Nina'],
        durationSeconds: 55,
      },
      {
        id: 'scene-3-5',
        order: 5,
        script:
          'Nina stood slowly. The booth door was open. The hallway beyond it was dark, and the dark was moving toward her.',
        status: 'approved',
        characterNames: ['Nina'],
        durationSeconds: 40,
      },
    ],
  },
  {
    id: 'proj-4',
    title: 'The Clockmaker’s Apprentice',
    genre: 'Adventure',
    generationMode: 'single_story',
    targetDurationSeconds: 300,
    videoModel: 'seedance',
    status: 'processing',
    createdAt: '2026-09-01T08:00:00Z',
    updatedAt: '2026-09-02T20:10:00Z',
    idea:
      'An apprentice clockmaker builds a pocket watch that lets the wearer rewind exactly sixty seconds — but each use costs one hour of memory.',
    characters: [
      { name: 'Lila', description: 'A curious apprentice clockmaker in her twenties.' },
      { name: 'Master Voss', description: 'An elderly, guarded master clockmaker.' },
    ],
    scenes: [
      {
        id: 'scene-4-1',
        order: 1,
        script:
          'The mainspring fought her every turn. Lila had been apprenticed to Master Voss for three years, long enough to know that a watch should not feel alive.',
        status: 'lipsync_ready',
        characterNames: ['Lila'],
        durationSeconds: 40,
      },
      {
        id: 'scene-4-2',
        order: 2,
        script:
          'This one did. When she pressed the crown, the world stuttered backward: a dropped gear leaped to her fingers, a broken lantern mended itself, the cat that had fled beneath the bench reappeared on the table.',
        status: 'video_ready',
        characterNames: ['Lila'],
        durationSeconds: 55,
      },
      {
        id: 'scene-4-3',
        order: 3,
        script:
          'She tried to remember her mother’s face and found a grey space where the image had been. "One use," Voss said from the doorway, "costs one hour of what you can never recover."',
        status: 'voice_ready',
        characterNames: ['Lila', 'Master Voss'],
        durationSeconds: 60,
      },
      {
        id: 'scene-4-4',
        order: 4,
        script:
          'Lila closed the case and slipped it into her pocket. There were hours she could afford to lose, and one she could not.',
        status: 'script_ready',
        characterNames: ['Lila'],
        durationSeconds: 45,
      },
      {
        id: 'scene-4-5',
        order: 5,
        script:
          'She looked at Voss. "Then I’ll make sure the next hour is worth it." He almost smiled — almost — before the shop bell rang and the future walked in.',
        status: 'pending',
        characterNames: ['Lila', 'Master Voss'],
        durationSeconds: 50,
      },
    ],
  },
  {
    id: 'proj-5',
    title: 'The Last Transmission',
    genre: 'Sci-Fi',
    generationMode: 'scene_by_scene',
    targetDurationSeconds: 600,
    videoModel: 'kling',
    status: 'processing',
    createdAt: '2026-08-29T09:30:00Z',
    updatedAt: '2026-09-02T14:00:00Z',
    idea:
      'A deep-space rescue crew receives a distress call from Earth — but Earth has been silent for eighty years.',
    characters: [
      { name: 'Captain Okonkwo', description: 'A composed, experienced rescue captain.' },
    ],
    scenes: [
      {
        id: 'scene-5-1',
        order: 1,
        script:
          'The signal arrived on a frequency no one monitored anymore, formatted in a protocol last used before the Silence.',
        status: 'lipsync_ready',
        characterNames: ['Captain Okonkwo'],
        durationSeconds: 45,
      },
      {
        id: 'scene-5-2',
        order: 2,
        script:
          '"This is the UNSS Armstrong," the voice said. "We are twelve hours from impact. Please respond."',
        status: 'video_ready',
        characterNames: ['Captain Okonkwo'],
        durationSeconds: 40,
      },
      {
        id: 'scene-5-3',
        order: 3,
        script:
          'Captain Okonkwo stared at the waveform. The chronometer showed they were eighty-three light-years from Earth, and Earth had not spoken since the Collapse.',
        status: 'script_ready',
        characterNames: ['Captain Okonkwo'],
        durationSeconds: 55,
      },
      {
        id: 'scene-5-4',
        order: 4,
        script:
          '"Play it again," she said. The voice was young, frightened, and unmistakably her own.',
        status: 'pending',
        characterNames: ['Captain Okonkwo'],
        durationSeconds: 45,
      },
    ],
  },
  {
    id: 'proj-6',
    title: 'Neon Rain',
    genre: 'Sci-Fi',
    generationMode: 'single_story',
    targetDurationSeconds: 300,
    videoModel: 'veo',
    status: 'breakdown_ready',
    createdAt: '2026-09-02T11:15:00Z',
    updatedAt: '2026-09-02T22:40:00Z',
    idea:
      'In a city where rain records memories, a detective drinks a vial of stormwater to solve a murder she committed.',
    characters: [
      { name: 'Kira', description: 'A sharp, haunted detective addicted to other people’s memories.' },
    ],
    scenes: [
      {
        id: 'scene-6-1',
        order: 1,
        script:
          'The rain in New Kowloon did not fall clean. It fell with fragments: laughter, arguments, the last words of the dying.',
        status: 'pending',
        characterNames: ['Kira'],
        durationSeconds: 40,
      },
      {
        id: 'scene-6-2',
        order: 2,
        script:
          'The city archived everything, and detectives like Kira drank it by the vial to walk through other people’s yesterdays.',
        status: 'pending',
        characterNames: ['Kira'],
        durationSeconds: 45,
      },
      {
        id: 'scene-6-3',
        order: 3,
        script:
          'This vial was labeled with a case number she knew too well. She swallowed it in one bitter gulp.',
        status: 'pending',
        characterNames: ['Kira'],
        durationSeconds: 40,
      },
      {
        id: 'scene-6-4',
        order: 4,
        script:
          'The memory unfolded in first person. A hand holding the knife. Her own voice saying, "I’m sorry." Kira opened her eyes. The rain kept falling, and now it knew her too.',
        status: 'pending',
        characterNames: ['Kira'],
        durationSeconds: 70,
      },
    ],
  },
  {
    id: 'proj-7',
    title: 'The Wrong Reflection',
    genre: 'Horror',
    generationMode: 'single_story',
    targetDurationSeconds: 300,
    videoModel: 'seedance',
    status: 'draft',
    createdAt: '2026-09-03T07:45:00Z',
    updatedAt: '2026-09-03T09:20:00Z',
    idea:
      'A woman notices her mirror reflection is lagging behind her movements — and then one day it stops lagging and starts leading.',
    characters: [],
    scenes: [],
  },
  {
    id: 'proj-8',
    title: 'Grandma’s Recipe for Trouble',
    genre: 'Comedy',
    generationMode: 'single_story',
    targetDurationSeconds: 300,
    videoModel: 'seedance',
    status: 'draft',
    createdAt: '2026-09-03T10:00:00Z',
    updatedAt: '2026-09-03T10:00:00Z',
    idea:
      'A granddaughter inherits her grandmother’s cookbook and discovers every recipe is a spell — and the page for "Finding Love" has been torn out.',
    characters: [],
    scenes: [],
  },
];

export const defaultDetailProjectId = 'proj-4';
