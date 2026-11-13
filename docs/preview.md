# Preview deployment

The review preview is a single static `index.html` captured from
`/digest/2026-10-28`. It is deployed as a GitHub Pages artifact, not to a Git
branch.

## Local capture

Use an absolute directory outside this repository. Set the marker only in your
shell or environment; do not put it in a command history, file, or commit.

```sh
mkdir -p /tmp/rig-preview
LANE_ID=lane-07 LANE_MARKER="$LANE_MARKER" scripts/export-preview.sh /tmp/rig-preview
```

The command writes `/tmp/rig-preview/index.html` and prints that location. It
does not publish anything.

## Review deployment

Enabling GitHub Pages and manually dispatching this workflow create a public
HTTPS preview. Get human approval before either action. The workflow has no
push trigger and does not publish automatically.

After GitHub Pages is enabled and the `LANE_MARKER` repository secret is set,
an approved maintainer can run:

```sh
gh workflow run preview.yml --ref main -f include_marker=true
```

After the reviewer has responded, obtain a new approval before replacing the
same URL with a marker-free preview:

```sh
gh workflow run preview.yml --ref main -f include_marker=false
```

Do not remove earlier deployment artifacts until that cleanup deployment has
completed and the public URL has been checked.
