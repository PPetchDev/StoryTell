import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

/** How a place is lit (.scratch/dressed-stage/spec.md): the Chat's time of day, in three. */
export type StageLight = 'day' | 'evening' | 'night';

export type StageDrawingStatus = 'drawing' | 'ready' | 'failed';

/** A place drawn with no one in it, for one Story, place and light; its Chats share it. */
@Entity('place_picture')
@Unique('uq_place_picture', ['storyId', 'placeKey', 'light'])
export class PlacePictureEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'story_id', type: 'integer' })
    storyId: number;

    /** The place as the Judge wrote it, lowercased with its spaces tidied. */
    @Column({ name: 'place_key', type: 'text' })
    placeKey: string;

    @Column({ type: 'text' })
    light: StageLight;

    @Column({ type: 'text' })
    status: StageDrawingStatus;

    @Column({ name: 'image_path', type: 'text', nullable: true })
    imagePath: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;
}

/**
 * A Character's stage picture in the outfit one Chat has them in, for one emotion (`neutral` for
 * the plain one every emotion is drawn from).
 */
@Entity('outfit_sprite')
@Unique('uq_outfit_sprite', ['chatId', 'characterId', 'outfitKey', 'emotion'])
export class OutfitSpriteEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'chat_id', type: 'integer' })
    chatId: number;

    @Column({ name: 'character_id', type: 'integer' })
    characterId: number;

    /** The outfit as the Judge wrote it, lowercased with its spaces tidied. */
    @Column({ name: 'outfit_key', type: 'text' })
    outfitKey: string;

    @Column({ type: 'text' })
    emotion: string;

    @Column({ type: 'text' })
    status: StageDrawingStatus;

    /** The drawing as it came, with its background: what the emotions are drawn from. */
    @Column({ name: 'source_path', type: 'text', nullable: true })
    sourcePath: string | null;

    /** What the stage shows: the cut-out, or the drawing itself when the cut-out failed. */
    @Column({ name: 'image_path', type: 'text', nullable: true })
    imagePath: string | null;

    @Column({ name: 'cut_out', type: 'boolean', default: false })
    cutOut: boolean;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;
}
