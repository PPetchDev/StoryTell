import { AppError } from './app-error.js';

export class PersonaNotFoundError extends AppError {
    constructor() {
        super('404.006.001', 'Persona not found.');
    }
}

/** A Persona created or renamed with nothing but whitespace as its Name. */
export class EmptyPersonaNameError extends AppError {
    constructor() {
        super('422.006.002', 'A Persona needs a Name.');
    }
}
