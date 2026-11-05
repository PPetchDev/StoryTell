import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Max, Min, registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

import { PortraitCrop } from '../../../model/story/entities/character.entity.js';

/** The square must end inside the image's width: `x + size <= 1`. */
function FitsTheWidth(options?: ValidationOptions) {
    return (object: object, propertyName: string) =>
        registerDecorator({
            name: 'fitsTheWidth',
            target: object.constructor,
            propertyName,
            options: { message: 'x + size must be at most 1', ...options },
            validator: {
                validate(size: unknown, args: ValidationArguments) {
                    const x = (args.object as { x?: unknown }).x;
                    return typeof size === 'number' && typeof x === 'number' && x + size <= 1 + 1e-9;
                },
            },
        });
}

/**
 * A square of the Reference image, in fractions of the image's width. The height is unknown
 * here, so `y` is only kept within a generous bound; the editor keeps it inside the picture.
 */
export class PortraitCropRequestBodyDTO implements PortraitCrop {
    @ApiProperty({ description: "Left edge, as a fraction of the image's width.", minimum: 0, maximum: 1 })
    @IsNumber()
    @Min(0)
    @Max(1)
    x: number;

    @ApiProperty({ description: "Top edge, as a fraction of the image's width.", minimum: 0, maximum: 4 })
    @IsNumber()
    @Min(0)
    @Max(4)
    y: number;

    @ApiProperty({ description: "Side of the square, as a fraction of the image's width.", minimum: 0.01, maximum: 1 })
    @IsNumber()
    @Min(0.01)
    @Max(1)
    @FitsTheWidth()
    size: number;
}
