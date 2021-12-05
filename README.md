# Mininet Editor

[![Deploy to Github Pages](https://github.com/scc365/me/actions/workflows/deploy.yaml/badge.svg?branch=release)](https://github.com/scc365/me/actions/workflows/deploy.yaml) [![Docker Build](https://github.com/scc365/me/actions/workflows/docker.yaml/badge.svg?branch=release)](https://github.com/scc365/me/actions/workflows/docker.yaml)

SDN topology editor in your web browser with Mininet export.

- Exports JSONs (whole projects), Python scripts (Mininet emulation), addressing plans and topology images.
- Imports JSONs and Python scripts.
- Persists projects even if the browser is closed and also works offline.

## Use ME

Access the **SCC365** instance from your browser using [this link](https://scc365.github.io/me).

If you wish to run ME locally, you can do so easily using Docker. The image is available for x86 and ARM with the tag: `ghcr.io/scc365/me:latest`.

```bash
docker run --rm -it --name me -p 8080:80 ghcr.io/scc365/me:latest
```

## Abuse ME

Want to make changes to ME? Well this is the fork for the SCC365 course @ Lancaster University, so you might want to make issues and PRs with the upstream?

You can still make changes to this fork of ME if you desire, but it is not likely that this fork will ever be merged upstream.
