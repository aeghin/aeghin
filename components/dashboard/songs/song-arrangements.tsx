"use client"

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { YoutubeIcon, SpotifyIcon } from "@/components/icons/brand-icons";
import { SongAttachments } from "@/components/dashboard/songs/song-attachments";

import { addSongArrangement, deleteSongArrangement, updateSongArrangement } from "@/lib/actions/song-arrangement";
import { songArrangementSchema, type songArrangementInput } from "@/lib/validations/song";
import type { VersionLinks } from "@/lib/arrangements";

import type { SongArrangement, SongAttachment, StorageUsage } from "@/lib/types";

type ActionResponse = { success: true } | { success: false; error: string };

interface SongArrangementsProps {
    songId: string;
    organizationId: string;
    /** The song's own links, which an arrangement can show instead of its own. */
    songLinks: VersionLinks;
    arrangements: SongArrangement[];
    /** Every file on the song. Each arrangement shows only its own. */
    attachments: SongAttachment[];
    storage: StorageUsage | null;
};

/**
 * The song dialog's other versions of the song: a recorded verse, the band's
 * own intro. Each is picked per event when the song goes on a setlist, and the
 * team then sees its files there instead of the Original's.
 *
 * Saved as they're made, like attachments, rather than by the song's Save. The
 * change shows in place, so only a failure gets a toast.
 */
export const SongArrangements = ({ songId, organizationId, songLinks, arrangements, attachments, storage }: SongArrangementsProps) => {

    const [isAdding, setIsAdding] = useState(false);

    return (
        <div className="space-y-2">
            <div>
                <p className="text-sm font-medium">Arrangements</p>
                <p className="text-xs text-muted-foreground">
                    Other versions with their own files, picked when the song goes on a setlist.
                </p>
            </div>

            {arrangements.map((arrangement) => (
                <ArrangementBox
                    key={arrangement.id}
                    songId={songId}
                    organizationId={organizationId}
                    songLinks={songLinks}
                    arrangement={arrangement}
                    attachments={attachments.filter((a) => a.arrangementId === arrangement.id)}
                    storage={storage}
                />
            ))}

            {isAdding ? (
                <ArrangementForm
                    initial={{ name: "", useSongLinks: true, spotifyUrl: "", youtubeUrl: "" }}
                    songLinks={songLinks}
                    submitLabel="Add"
                    onSave={(values) => addSongArrangement(organizationId, songId, values)}
                    onDone={() => setIsAdding(false)}
                />
            ) : (
                <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2 border-dashed"
                    onClick={() => setIsAdding(true)}
                >
                    <Plus className="h-4 w-4" />
                    Add arrangement
                </Button>
            )}
        </div>
    );
};

interface ArrangementBoxProps {
    songId: string;
    organizationId: string;
    songLinks: VersionLinks;
    arrangement: SongArrangement;
    attachments: SongAttachment[];
    storage: StorageUsage | null;
};

/** One arrangement: its name and links, with its files under them. */
function ArrangementBox({ songId, organizationId, songLinks, arrangement, attachments, storage }: ArrangementBoxProps) {

    const router = useRouter();
    const [isEditing, setIsEditing] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);
    const [isDeleting, startDelete] = useTransition();

    const handleDelete = () => {
        startDelete(async () => {
            const result = await deleteSongArrangement(organizationId, arrangement.id);

            if (result.success) {
                router.refresh();
            } else {
                setIsConfirming(false);
                toast.error(result.error, { position: "top-center" });
            }
        });
    };

    if (isEditing) {
        return (
            <ArrangementForm
                initial={{
                    name: arrangement.name,
                    useSongLinks: arrangement.useSongLinks,
                    spotifyUrl: arrangement.spotifyUrl ?? "",
                    youtubeUrl: arrangement.youtubeUrl ?? "",
                }}
                songLinks={songLinks}
                submitLabel="Save"
                onSave={(values) => updateSongArrangement(organizationId, arrangement.id, values)}
                onDone={() => setIsEditing(false)}
            />
        );
    }

    return (
        <div className="space-y-2 rounded-md border bg-muted/20 p-2.5">
            <div className="flex items-center gap-1.5">
                <p className="min-w-0 flex-1 truncate text-sm font-medium">{arrangement.name}</p>
                {arrangement.useSongLinks ? (
                    <span className="shrink-0 text-xs text-muted-foreground">Uses the song&apos;s links</span>
                ) : arrangement.spotifyUrl || arrangement.youtubeUrl ? (
                    <LinkIcons links={arrangement} />
                ) : (
                    <span className="shrink-0 text-xs text-muted-foreground">No links</span>
                )}
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground"
                    onClick={() => setIsEditing(true)}
                    disabled={isDeleting}
                    aria-label={`Edit ${arrangement.name}`}
                >
                    <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => setIsConfirming(true)}
                    disabled={isDeleting}
                    aria-label={`Delete ${arrangement.name}`}
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>

            {isConfirming ? (
                <div className="flex items-center gap-2 rounded-md bg-destructive/5 px-2.5 py-2">
                    <p className="min-w-0 flex-1 text-xs text-destructive">
                        {attachments.length === 0
                            ? `Delete ${arrangement.name}?`
                            : `Delete ${arrangement.name} and its ${attachments.length === 1 ? "file" : `${attachments.length} files`}?`}
                    </p>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setIsConfirming(false)} disabled={isDeleting}>
                        Cancel
                    </Button>
                    <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={isDeleting}>
                        {isDeleting && <Spinner className="h-3.5 w-3.5" />}
                        Delete
                    </Button>
                </div>
            ) : (
                <SongAttachments
                    songId={songId}
                    organizationId={organizationId}
                    arrangementId={arrangement.id}
                    attachments={attachments}
                    storage={storage}
                    compact
                />
            )}
        </div>
    );
}

/** Spotify and YouTube buttons, for whichever of the two links there are. */
function LinkIcons({ links }: { links: VersionLinks }) {
    return (
        <>
            {links.spotifyUrl && (
                <a
                    href={links.spotifyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-emerald-600"
                    aria-label="Open in Spotify"
                >
                    <SpotifyIcon className="h-4 w-4" />
                </a>
            )}
            {links.youtubeUrl && (
                <a
                    href={links.youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-red-600"
                    aria-label="Open in YouTube"
                >
                    <YoutubeIcon className="h-4.5 w-4.5" />
                </a>
            )}
        </>
    );
}

interface ArrangementFormProps {
    initial: songArrangementInput;
    /** Shown beside the switch while it's on, so you can see which links those are. */
    songLinks: VersionLinks;
    submitLabel: string;
    onSave: (values: songArrangementInput) => Promise<ActionResponse>;
    onDone: () => void;
};

/**
 * Name and links, for a new arrangement or an existing one. Not a <form>: it
 * sits inside the song dialog's, so Enter in a field is caught here rather
 * than saving the song.
 */
function ArrangementForm({ initial, songLinks, submitLabel, onSave, onDone }: ArrangementFormProps) {

    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const form = useForm<songArrangementInput>({
        resolver: zodResolver(songArrangementSchema),
        mode: "onChange",
        defaultValues: initial,
    });

    const { isValid, isDirty } = form.formState;
    const useSongLinks = form.watch("useSongLinks");

    const submit = form.handleSubmit((values) => {
        startTransition(async () => {
            const result = await onSave(values);

            if (result.success) {
                router.refresh();
                onDone();
            } else {
                toast.error(result.error, { position: "top-center" });
            }
        });
    });

    return (
        <Form {...form}>
            <div
                className="space-y-3 rounded-md border bg-background p-3"
                onKeyDown={(e) => {
                    if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
                        e.preventDefault();
                        submit();
                    }
                }}
            >
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                                <Input {...field} placeholder="Verse sample" autoFocus disabled={isPending} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="useSongLinks"
                    render={({ field }) => (
                        <FormItem className="flex items-center gap-1.5">
                            <FormLabel className="flex-1">Use the song&apos;s links</FormLabel>
                            {field.value && <LinkIcons links={songLinks} />}
                            <FormControl>
                                <Switch
                                    checked={field.value}
                                    onCheckedChange={(checked) => {
                                        field.onChange(checked);
                                        // The boxes hide while it's on, so nothing left in them may hold up saving.
                                        if (checked) {
                                            form.setValue("spotifyUrl", "", { shouldValidate: true });
                                            form.setValue("youtubeUrl", "", { shouldValidate: true });
                                        }
                                    }}
                                    disabled={isPending}
                                />
                            </FormControl>
                        </FormItem>
                    )}
                />
                {!useSongLinks && (
                    <>
                        <FormField
                            control={form.control}
                            name="spotifyUrl"
                            render={({ field }) => (
                                <FormItem>
                                    <div className="relative">
                                        <SpotifyIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                        <FormControl>
                                            <Input {...field} placeholder="Spotify URL" aria-label="Spotify URL" className="pl-9" disabled={isPending} />
                                        </FormControl>
                                    </div>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="youtubeUrl"
                            render={({ field }) => (
                                <FormItem>
                                    <div className="relative">
                                        <YoutubeIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                        <FormControl>
                                            <Input {...field} placeholder="YouTube URL" aria-label="YouTube URL" className="pl-9" disabled={isPending} />
                                        </FormControl>
                                    </div>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <p className="text-xs text-muted-foreground">
                            Leave both empty to show only this arrangement&apos;s files.
                        </p>
                    </>
                )}
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={onDone} disabled={isPending}>
                        Cancel
                    </Button>
                    <Button type="button" size="sm" className="gap-1.5" onClick={submit} disabled={!isValid || !isDirty || isPending}>
                        {isPending && <Spinner className="h-3.5 w-3.5" />}
                        {submitLabel}
                    </Button>
                </div>
            </div>
        </Form>
    );
}
