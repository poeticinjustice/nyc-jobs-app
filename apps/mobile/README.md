# NYC Jobs Mobile

Expo (React Native) client for the NYC Jobs app. Search NYC city, state, federal, and other New York job listings; save jobs, track application status, and keep notes. Talks to the same Express backend as the web client.

## Run locally

```bash
npm install
npx expo start
```

Open the app in the iOS simulator, an Android emulator, or Expo Go. Screens live in `app/` (Expo Router file-based routing).

## API base URL

The app resolves the backend URL in this order:

1. `EXPO_PUBLIC_API_BASE_URL` env var (set it in a `.env` file or your shell). On a physical device, point it at your dev machine's LAN IP, e.g. `http://192.168.1.100:8000`.
2. In dev, the Expo dev-server host with port 8000 (works for simulators and devices on the same network).
3. In production builds, `https://nyc-jobs-app.onrender.com`.

## Builds (EAS)

`eas.json` defines three profiles:

- `development` — internal distribution with the dev client: `eas build --profile development`
- `preview` — internal distribution build: `eas build --profile preview`
- `production` — store build: `eas build --profile production`

Preview and production builds pin `EXPO_PUBLIC_API_BASE_URL` to the deployed backend. You need an Expo account and the EAS CLI (`npm i -g eas-cli`, then `eas login`).
