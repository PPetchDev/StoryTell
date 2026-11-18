import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsObject, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';

export class PushConfigResponseBodyDTO {
    @ApiProperty({ type: String, nullable: true, description: 'The VAPID public key a browser subscribes with; null while alerts are off.' })
    publicKey: string | null;
}

export class PushKeysDTO {
    @ApiProperty({ description: 'The P-256 public key of the subscription, base64url.' })
    @IsString()
    @MinLength(1)
    @MaxLength(200)
    p256dh: string;

    @ApiProperty({ description: 'The auth secret of the subscription, base64url.' })
    @IsString()
    @MinLength(1)
    @MaxLength(100)
    auth: string;
}

/** A browser PushSubscription as `toJSON()` gives it. */
export class PushSubscriptionRequestBodyDTO {
    @ApiProperty({ description: 'The push service address: https on a known push service, else `UnknownPushServiceError`.' })
    @IsString()
    @MaxLength(2000)
    endpoint: string;

    @ApiProperty({ type: PushKeysDTO })
    @IsObject()
    @ValidateNested()
    @Type(() => PushKeysDTO)
    keys: PushKeysDTO;
}

export class PushUnsubscribeRequestBodyDTO {
    @ApiProperty()
    @IsString()
    @MaxLength(2000)
    endpoint: string;
}
