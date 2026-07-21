# RouteComment

Client-side orienteering review tool: georeference a map image, overlay GPS tracks and route plans, annotate with time-linked comments, and save everything as a ZIP project.

## Stack

- Vite + React + TypeScript
- MapLibre GL JS
- Zustand, JSZip

## Develop

```bash
npm install
npm run dev
```

## Usage

1. **Map image** — load a PNG/JPEG orienteering map (placed as an overlay)
2. **Georef** — two-point align on the map: overlay feature → basemap, then a second pair for rotate/scale
3. **GPX** — load a GPS track
4. **Plan** — draw a planned route; toggle visibility against the track
5. **Comment** — Map pin (bubble + on-map popup), Follow (runner bubble), or Danmaku (scrolls once at a playback time)
6. **View** — play back the track (speed up to 120×); follow bubbles and danmaku appear on cue
7. **Save / Load ZIP** — `project.json` + map image + optional `track.gpx`
