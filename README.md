# STP Live Pub Quiz

A live, reusable team pub-quiz web app designed for a classroom projector + team devices.

## What it does

- Host dashboard protected by Google sign-in.
- Teams join anonymously with a six-character code and team name.
- Students only see answer boxes, not the host's question text or answer key.
- Live round states: ready → open → locked → marked/revealed.
- One answer sheet per team per round; teams can update until the host locks the round.
- Automatic marking for text, multiple choice and numeric answers.
- Near-spelling matches are flagged for manual review rather than auto-accepted.
- Song + artist / two-part answers.
- Closest-wins rounds with 3/2/1 ranking and optional “without going over”.
- One joker per team, chosen before a round opens, doubling that round score.
- Manual point overrides and team score adjustments.
- Live submission count and “still waiting” team list for the host.
- Projector presentation mode with question text, images/audio/video/YouTube, timers, answer reveals and leaderboard.
- Leaderboard is hidden from teams at the database level until the host reveals it.
- Starter quiz containing eight round templates.

## Firebase setup

The site is static and can live on GitHub Pages. Firebase supplies secure login + the live database so different team devices can communicate in real time.

1. Go to Firebase Console and create a project.
2. Add a **Web app** to the project.
3. Copy the Firebase config object into `firebase-config.js`.
4. Open **Authentication → Sign-in method** and enable:
   - Google (host)
   - Anonymous (teams)
5. Create **Cloud Firestore**.
6. Open **Firestore → Rules**, replace the rules with `firestore.rules`, and publish them.
7. In Authentication settings, make sure your GitHub Pages domain is in **Authorized domains**.
8. Enable GitHub Pages for this repository from the `main` branch.

This project uses Firebase's browser-module build from the official gstatic CDN, so there is no npm/build step.

## How to run a quiz

1. Open `host.html` and sign in with Google.
2. Create the sample quiz or a blank quiz.
3. Edit rounds/questions under **Build quiz**.
4. Copy the team link or display the join code.
5. Open **Presentation screen** on the projector.
6. Select a round and leave it on **Ready** while teams decide whether to play their joker.
7. Press **Open answers**, then read/show the questions live.
8. Press **Lock round**.
9. Open **Mark round**, press **Auto mark**, review near-matches, adjust points if needed, then **Save scores**.
10. Reveal answers and/or reveal the leaderboard when you want the room to see them.

## Media

Each host question has an optional media URL. The presentation screen supports images, audio, video and YouTube links. For the most reliable school setup, put media in an `assets/` folder and use relative paths such as `assets/round1-q1.jpg`.

## Keyboard shortcuts

- `→` next projector question
- `←` previous projector question
- `O` open answers
- `L` lock round

## Security

Correct answers and host prompts live in the host-only `hostRounds` collection. Team answer sheets can only be read by that team and the host. Other teams' scores are not readable until the host turns on the separate leaderboard reveal.

Firebase's web configuration object is not a secret; protection comes from Authentication and Firestore security rules. Do not use Firestore test-mode rules for the live quiz.


## Quiz media credits

The built-in 2026 Year 9 & 10 quiz uses openly licensed Wikimedia Commons images for the Zoomed In round:
- Tennis ball close-up — CC0, Wikimedia Commons.
- LCD pixels RGB — public domain, Wikimedia Commons.
- Ballpoint macro — public domain, Wikimedia Commons.
- Zipper slider — CC0, Wikimedia Commons.
- Kiwifruit skin — Wikimedia Commons (see file page for licence/attribution).

The Watch Closely round uses Transport for London's 2008 awareness film "Whodunnit?" via YouTube. The host instructions tell the presenter to pause before the video's own reveal section.

Popular-song audio is not bundled with this repository. The host should play the five selected tracks from a music service they are authorised to use.


### Additional Zoomed In microscope sources
- Match head microscope photograph: Pikabu user-uploaded microscope image (remote image embedded; not redistributed in this repository).
- Potato chips under microscope: Mikrula, 200× microscope image (remote image embedded; not redistributed in this repository).
