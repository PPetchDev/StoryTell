import { Literata } from 'next/font/google';

/**
 * The book face for story text (spec: "The book face"): narration, speech, the user's lines
 * and the Opening preview. next/font downloads it at build time and serves it with the app,
 * so it works offline and the browser never calls Google. Controls keep the system face.
 */
export const bookFace = Literata({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-book', display: 'swap' });
