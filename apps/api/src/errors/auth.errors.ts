import { AppError } from './app-error.js';

/** A request without a valid session while sign-in is on (.scratch/sign-in/spec.md). */
export class SignInRequiredError extends AppError {
    constructor() {
        super('401.010.001', 'Sign in first.');
    }
}

/** A sign-in with the wrong password. */
export class WrongPasswordError extends AppError {
    constructor() {
        super('401.010.002', 'That password is wrong.');
    }
}

/** A sign-in while guessing is locked out, right password or not. */
export class TooManySignInTriesError extends AppError {
    constructor(minutesLeft: number) {
        super('429.010.003', `Too many wrong passwords. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`);
    }
}
