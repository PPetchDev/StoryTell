'use client';

import { ChangeEvent, useEffect, useRef, useState } from 'react';

import { useConnection } from '@/components/connection';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { preparedForUpload } from '@/lib/cover';
import { MetPlace, Place, PLACE_LIGHT_LABEL, PLACE_LIGHTS, PLACE_LOOKS_MAX, PLACE_NAME_MAX, PlaceLight, PlacePictures, Places, placesApi } from '@/lib/places';
import { referenceImageUrl } from '@/lib/story';
import { usd } from '@/lib/types';
import { useDrawPrice } from './expressions';
import { ConfirmButton, FIELD_HINT, INPUT_BOX, inputEdge } from './fields';
import { FoldingCard, NOTE } from './folding-card';

/** The error code a draw is routed on (docs/error-codes.md). */
const OUT_OF_IMAGE_CREDIT = '402.001.004';

interface PlacesCardProps {
    storyId: number;
    /** The Story's Lore entry names, to add a Place from. */
    loreNames: readonly string[];
}

/**
 * Places drawn ahead (.scratch/places-ahead/spec.md): the Story's places, named and described,
 * drawn before play for the novel view's stage and the Place backdrop. The Judge is told their
 * names, so a Chat at one shows its picture at once. Places Chats drew in play are listed too.
 */
export function PlacesCard({ storyId, loreNames }: PlacesCardProps) {
    const { reportUnreachable } = useConnection();
    const price = useDrawPrice();
    const [data, setData] = useState<Places | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [newName, setNewName] = useState('');
    const [addError, setAddError] = useState<string | null>(null);

    useEffect(() => {
        let live = true;
        placesApi.list(storyId).then(
            (loaded) => live && setData(loaded),
            (caught: unknown) => {
                if (!live) return;
                if (caught instanceof ApiUnreachableError) reportUnreachable();
                setLoadError("Couldn't load the Places.");
            },
        );
        return () => {
            live = false;
        };
    }, [storyId, reportUnreachable]);

    /** Runs a write that answers the Places; its message goes to `onError`. */
    const write = async (run: () => Promise<Places>, onError: (message: string) => void): Promise<boolean> => {
        try {
            setData(await run());
            return true;
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) reportUnreachable();
            else if (caught instanceof ApiError && caught.code === OUT_OF_IMAGE_CREDIT) onError('Out of image credit, so it was not drawn. Play is unaffected.');
            else onError(caught instanceof Error ? caught.message : 'Something went wrong.');
            return false;
        }
    };

    const add = async (name: string) => {
        setAddError(null);
        if (await write(() => placesApi.add(storyId, { name }), setAddError)) setNewName('');
    };

    const names = new Set((data?.places ?? []).map((place) => place.name.trim().toLowerCase()));
    const fromLore = loreNames.filter((name) => name.trim() !== '' && !names.has(name.trim().toLowerCase()));
    const each = price === null ? 'a picture each' : `about ${usd(price)} a picture`;

    return (
        <FoldingCard foldKey={`places:${storyId}`} label="Places" title="Places" fieldPrefixes={[]}>
            <p className={NOTE}>
                The places the story goes to, drawn before you play, for the novel view&apos;s stage and the Place backdrop. When a Chat is at
                one, the app uses its name, so its picture shows at once. Day is drawn from the name and how it looks; evening and night are
                drawn from day. On image credit, {each}. Or upload a picture you made elsewhere, in any light, free.
            </p>
            {loadError && <p className="field-error m-0 mb-2">{loadError}</p>}
            {data && (
                <>
                    {data.places.length > 0 && (
                        <ul className="m-0 mb-3 grid list-none gap-3 p-0" aria-label="Places">
                            {data.places.map((place) => (
                                <PlaceItem key={place.id} storyId={storyId} place={place} price={price} write={write} />
                            ))}
                        </ul>
                    )}
                    <form
                        className="flex flex-wrap items-end gap-2"
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (newName.trim() !== '') void add(newName);
                        }}
                    >
                        <label className="grid min-w-0 flex-1 basis-48 gap-1">
                            <span className="text-md font-bold text-muted">New place</span>
                            <input
                                className={`${INPUT_BOX} w-full ${inputEdge()}`}
                                value={newName}
                                maxLength={PLACE_NAME_MAX}
                                placeholder="Rin's tree-house"
                                onChange={(event) => setNewName(event.target.value)}
                            />
                        </label>
                        <button type="submit" className="button" disabled={newName.trim() === ''}>
                            Add
                        </button>
                    </form>
                    {fromLore.length > 0 && (
                        <label className="mt-2 grid max-w-[44rem] gap-1">
                            <span className="text-md font-bold text-muted">Or add one from Lore</span>
                            <select
                                className={`${INPUT_BOX} w-full ${inputEdge()}`}
                                value=""
                                onChange={(event) => {
                                    if (event.target.value !== '') void add(event.target.value);
                                }}
                            >
                                <option value="">Pick a Lore entry…</option>
                                {fromLore.map((name) => (
                                    <option key={name} value={name}>
                                        {name}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                    {addError && (
                        <p className="field-error m-0 mt-2" role="alert">
                            {addError}
                        </p>
                    )}
                    {data.met.length > 0 && (
                        <>
                            <h3 className="m-0 mt-5 text-base font-semibold">Met in play</h3>
                            <p className={`${FIELD_HINT} mt-0.5 mb-2`}>
                                Places your Chats drew, by the words the story used. Keep one as a Place to name and describe it, or remove its
                                pictures.
                            </p>
                            <ul className="m-0 grid list-none gap-3 p-0" aria-label="Places met in play">
                                {data.met.map((met) => (
                                    <MetItem key={met.key} storyId={storyId} met={met} taken={names.has(met.key)} write={write} />
                                ))}
                            </ul>
                        </>
                    )}
                </>
            )}
        </FoldingCard>
    );
}

type Write = (run: () => Promise<Places>, onError: (message: string) => void) => Promise<boolean>;

function PlaceItem({ storyId, place, price, write }: { storyId: number; place: Place; price: number | null; write: Write }) {
    const [name, setName] = useState(place.name);
    const [looks, setLooks] = useState(place.looks);
    const [error, setError] = useState<string | null>(null);
    /** The light being drawn or uploaded now from this page. */
    const [drawing, setDrawing] = useState<PlaceLight | null>(null);
    const [uploading, setUploading] = useState(false);
    /** The light the file picker is open for. */
    const uploadLight = useRef<PlaceLight>('day');
    const fileInput = useRef<HTMLInputElement>(null);
    useEffect(() => setName(place.name), [place.name]);
    useEffect(() => setLooks(place.looks), [place.looks]);

    const save = (fields: { name?: string; looks?: string }) => {
        setError(null);
        void write(() => placesApi.change(storyId, place.id, fields), (message) => {
            setError(message);
            setName(place.name);
            setLooks(place.looks);
        });
    };
    const draw = async (light: PlaceLight) => {
        setError(null);
        setDrawing(light);
        await write(() => placesApi.draw(storyId, place.id, light), setError);
        setDrawing(null);
    };
    const pickFile = (light: PlaceLight) => {
        uploadLight.current = light;
        fileInput.current?.click();
    };
    const upload = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        const light = uploadLight.current;
        setError(null);
        setDrawing(light);
        setUploading(true);
        const { picture, filename } = await preparedForUpload(file);
        await write(() => placesApi.upload(storyId, place.id, light, picture, filename), setError);
        setDrawing(null);
        setUploading(false);
    };
    const drawLabel = price === null ? 'Draw' : `Draw · ${usd(price)}`;

    return (
        <li className="grid gap-2 rounded-lg bg-surface-raised p-3" aria-label={place.name}>
            <label className="grid gap-1">
                <span className="text-md font-bold text-muted">Name</span>
                <input
                    className={`${INPUT_BOX} w-full ${inputEdge()}`}
                    value={name}
                    maxLength={PLACE_NAME_MAX}
                    onChange={(event) => setName(event.target.value)}
                    onBlur={() => name.trim() !== place.name && save({ name })}
                />
            </label>
            <label className="grid gap-1">
                <span className="text-md font-bold text-muted">How it looks</span>
                <textarea
                    className={`${INPUT_BOX} w-full resize-y ${inputEdge()}`}
                    rows={2}
                    value={looks}
                    maxLength={PLACE_LOOKS_MAX}
                    placeholder="A house grown inside a silver tree, round windows, moss on the sills"
                    onChange={(event) => setLooks(event.target.value)}
                    onBlur={() => looks.trim() !== place.looks && save({ looks })}
                />
            </label>
            <ul className="m-0 grid list-none gap-2 p-0" aria-label={`Pictures of ${place.name}`}>
                {PLACE_LIGHTS.map((light) => {
                    const picture = place.pictures[light];
                    const drawn = picture?.status === 'ready' && picture.imagePath !== null;
                    const busy = drawing === light || picture?.status === 'drawing';
                    const needsDay = light !== 'day' && !(place.pictures.day?.status === 'ready');
                    return (
                        <li key={light} className="flex min-w-0 items-center gap-3">
                            <Thumbnail picture={picture} alt={`${place.name}, ${PLACE_LIGHT_LABEL[light].toLowerCase()}`} />
                            <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                                <span className="font-semibold">{PLACE_LIGHT_LABEL[light]}</span>
                                {busy ? (
                                    <span className="hint mt-0" role="status">
                                        {uploading && drawing === light ? 'Uploading…' : 'Drawing…'}
                                    </span>
                                ) : (
                                    <div className="flex flex-wrap gap-2">
                                        {drawn ? (
                                            <ConfirmButton
                                                small
                                                label="Draw again"
                                                ariaLabel={`Draw ${place.name} again, ${PLACE_LIGHT_LABEL[light].toLowerCase()}`}
                                                question={`Draw ${place.name} (${PLACE_LIGHT_LABEL[light].toLowerCase()}) again?`}
                                                warning="The new picture replaces this one."
                                                confirmLabel={price === null ? 'Draw again' : `Draw again · ${usd(price)}`}
                                                disabled={drawing !== null}
                                                onConfirm={() => draw(light)}
                                            />
                                        ) : (
                                            <button
                                                type="button"
                                                className="button button-quiet button-small"
                                                aria-label={`Draw ${place.name}, ${PLACE_LIGHT_LABEL[light].toLowerCase()}`}
                                                disabled={needsDay || drawing !== null}
                                                onClick={() => void draw(light)}
                                            >
                                                {drawLabel}
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            className="button button-quiet button-small"
                                            aria-label={`Upload a picture of ${place.name}, ${PLACE_LIGHT_LABEL[light].toLowerCase()}`}
                                            disabled={drawing !== null}
                                            onClick={() => pickFile(light)}
                                        >
                                            Upload
                                        </button>
                                    </div>
                                )}
                                {needsDay && !busy && <span className="hint mt-0">Draw after day</span>}
                            </div>
                        </li>
                    );
                })}
            </ul>
            <input
                ref={fileInput}
                className="visually-hidden"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                aria-label={`Picture of ${place.name}`}
                tabIndex={-1}
                onChange={(event) => void upload(event)}
            />
            {error && (
                <p className="field-error m-0" role="alert">
                    {error}
                </p>
            )}
            <div>
                <ConfirmButton
                    small
                    danger
                    label="Remove"
                    ariaLabel={`Remove the Place ${place.name}`}
                    question={`Remove ${place.name}?`}
                    warning="Its pictures go too. Chats already there keep playing."
                    confirmLabel="Remove"
                    disabled={drawing !== null}
                    onConfirm={() => write(() => placesApi.remove(storyId, place.id), setError)}
                />
            </div>
        </li>
    );
}

function MetItem({ storyId, met, taken, write }: { storyId: number; met: MetPlace; taken: boolean; write: Write }) {
    const [error, setError] = useState<string | null>(null);
    const drawn = PLACE_LIGHTS.filter((light) => met.pictures[light]?.status === 'ready');
    return (
        <li className="grid gap-2 rounded-lg bg-surface-raised p-3" aria-label={met.key}>
            <span className="font-semibold [overflow-wrap:anywhere]">{met.key}</span>
            <div className="flex flex-wrap gap-2">
                {drawn.map((light) => (
                    <Thumbnail key={light} picture={met.pictures[light]} alt={`${met.key}, ${PLACE_LIGHT_LABEL[light].toLowerCase()}`} />
                ))}
            </div>
            <div className="flex flex-wrap gap-2">
                {!taken && (
                    <button
                        type="button"
                        className="button button-quiet button-small"
                        aria-label={`Keep ${met.key} as a Place`}
                        onClick={() => void write(() => placesApi.add(storyId, { name: met.key }), setError)}
                    >
                        Keep as a Place
                    </button>
                )}
                <ConfirmButton
                    small
                    danger
                    label="Remove"
                    ariaLabel={`Remove the pictures of ${met.key}`}
                    question={`Remove the pictures of ${met.key}?`}
                    warning="A Chat that is there draws it again when its stage is dressed."
                    confirmLabel="Remove"
                    onConfirm={() => write(() => placesApi.removeMet(storyId, met.key), setError)}
                />
            </div>
            {error && (
                <p className="field-error m-0" role="alert">
                    {error}
                </p>
            )}
        </li>
    );
}

/** A small 16:9 picture of a place, or an empty frame. */
function Thumbnail({ picture, alt }: { picture: PlacePictures[PlaceLight]; alt: string }) {
    if (picture?.imagePath && picture.status !== 'failed') {
        return <img className="aspect-video w-28 flex-none rounded-md object-cover" src={`${referenceImageUrl(picture.imagePath)}?w=640`} alt={alt} loading="lazy" />;
    }
    return <span className="aspect-video w-28 flex-none rounded-md border border-dashed border-faint" aria-hidden="true" />;
}
