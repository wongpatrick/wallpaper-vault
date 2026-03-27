# Wallpaper Vault: Frontend Architecture Plan (Electron + React)

## Background & Motivation
The "Wallpaper Vault" needs a desktop-grade UI that can manage local high-resolution images, browse creators, and eventually set wallpapers directly on the user's OS. **Electron** provides the native shell, while **React (with Vite)** provides a modern, fast UI.

## Scope & Impact
- Build a desktop "Shell" that communicates with the existing FastAPI backend.
- Provide a visually rich interface for browsing Sets and Creators.
- Prepare for future features like local image previews and system-tray rotation.

---

## Architectural Decisions
- **UI Framework:** React (TypeScript) + Vite
- **Shell:** Electron
- **Communication:** `fetch()` or `axios` (talking to `http://localhost:8000/api`)
- **Styling:** Vanilla CSS or Tailwind (to maintain a polished "Desktop" look)
- **State Management:** React `useEffect` or TanStack Query (to handle API fetching)

---

## Implementation Steps

### Phase 1: Initialization & Shell (Completed ✅)
1. **Init Vite:** Create the React + TS project in the `frontend/` folder.
2. **Install Electron:** Set up the main and preload scripts to launch the Vite dev server.
3. **IPC Bridge:** Establish the "Inter-Process Communication" (IPC) bridge so React can talk to Node.js.

### Phase 2: Core Components & Connectivity (Next 🚀)
1. **API Client:** Set up a central `api.ts` file to handle `fetch()` calls to the FastAPI backend.
2. **Creator View:** Create a sidebar or gallery to list all **Creators** (fetching from `GET /api/creators/`).
3. **Dashboard View:** Create the first screen to list all **Wallpaper Sets** (fetching from `GET /api/sets/`).
4. **Error Handling:** Build a "Server Offline" screen if the FastAPI backend isn't running.

### Phase 3: Media & Interaction
1. **Set Detail:** Clicking a set should show the full details (Title, Creators, and placeholder for Images).
2. **Linking Creator:** A UI form to create a new **Set** and link it to an existing **Creator** via a dropdown.
3. **Search & Filter:** Add a search bar to filter your local collection by title or artist.

### Phase 4: Native Features (Future)
1. **Local Image Loading:** Displaying actual high-res files from the `local_path`.
2. **"Set as Wallpaper":** A button that calls a Node.js script to change the desktop background.
3. **System Tray:** Minimize the app to the tray and add a "Next Wallpaper" right-click menu.

---

## Verification
- Run `npm run dev` to launch the Vite server + Electron.
- Confirm the app successfully fetches and displays the "Artistic Soul" creator from the backend.
