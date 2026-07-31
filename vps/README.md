# AVLI VPS Media Store

This service is the remote storage half of the L7 hybrid media pipeline. It stores objects by SHA-256, verifies every upload, uses immutable file permissions, and requires bearer authentication for reads and writes.

It is dormant in the local profile. L7 never selects it from the presence of a URL alone; activation requires the explicit `AVLI_MEDIA_STORAGE=vps` setting.

## VPS environment

Create `/etc/avli-media-store.env` readable only by root:

```dotenv
AVLI_STORE_TOKEN=generate-a-long-random-secret
AVLI_STORE_ROOT=/var/lib/avli-media
AVLI_STORE_BIND=127.0.0.1
AVLI_STORE_PORT=18842
AVLI_STORE_PUBLIC_URL=https://media.example.com
AVLI_STORE_MAX_BYTES=2147483648
```

Run the Node service as the unprivileged `avli` user and put Caddy or nginx in front of it for TLS. The provided systemd and Caddy files are templates; change `/opt/avli-media-store` and the hostname to match the VPS.

## L7 workstation environment

```dotenv
AVLI_MEDIA_STORAGE=vps
AVLI_MEDIA_STORAGE_URL=https://media.example.com
AVLI_MEDIA_STORAGE_TOKEN=the-same-long-random-secret
AVLI_MEDIA_EXECUTION=mock
```

Do not commit either environment file. Once real render adapters are installed, change `AVLI_MEDIA_EXECUTION` from `mock` to the configured adapter mode.
