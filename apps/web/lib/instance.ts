// Dev runs with INSTANCE_LABEL=dev, so an installed dev PWA can't be mistaken for live.
const label = process.env.INSTANCE_LABEL;

export const appName = label ? `Storytell AI (${label})` : 'Storytell AI';
export const shortName = label ? `Storytell ${label}` : 'Storytell';
