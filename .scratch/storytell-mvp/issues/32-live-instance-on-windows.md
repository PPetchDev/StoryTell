# Run the live instance on the home PC

Type: task
Status: ready-for-human
Blocked by: 17, 19
Part of: [Spec: Storytell AI MVP](../spec.md)

## What to do

The agent can write the build and deploy scripts and the README section. Installing services and changing system settings is the user's job.

- **Live instance.** A live build of the frontend and API with its own database, port and image folder, separate from dev. It is updated only by build, migrate, then restart, through one deploy script.
- **Autostart.** PostgreSQL, the live app and Tailscale start automatically with Windows, as services or startup tasks.
- **Tailscale serve.** The live app is published on the tailnet over HTTPS at the PC's `*.ts.net` name. Never use Funnel or a public tunnel.
- **Install the PWA** on the Windows desktop and the Android phone from that URL.

## Acceptance criteria

- [ ] After a reboot, with nothing launched by hand, the phone opens the PWA and lists Stories.
- [ ] A dev migration doesn't touch the live database.
- [ ] The README documents the deploy steps and the host retention notes from ticket 17.

## User stories covered

132–134, 137, 138.
