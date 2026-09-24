"use client"

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, EllipsisVertical, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuItem
} from "@/components/ui/dropdown-menu";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { SongModal } from "@/components/dashboard/songs/song-modal";

import { deleteSongFromLibrary } from "@/lib/actions/song";

import type { LibrarySong, StorageUsage } from "@/lib/types";

interface EditSongDetailsProps {
    song: LibrarySong;
    orgId: string;
    storage: StorageUsage | null;
};

export const EditSongDetails = ({ song, orgId, storage }: EditSongDetailsProps) => {

    const [open, setOpen] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [isPending, startTransition] = useTransition();

    const router = useRouter();

    const handleDelete = () => {
        startTransition(async () => {
            const result = await deleteSongFromLibrary(orgId, song.id);

            if (result.success) {
                setConfirmOpen(false);
                toast.success("Song removed from library", { position: "top-center" });
                router.refresh();
            } else {
                
                toast.error(result.error, { position: "top-center" });
            };
        });
    };

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground"
                    >
                        <EllipsisVertical className="h-4 w-4" />
                        <span className="sr-only">Song actions</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuItem
                        onSelect={(e) => {
                            e.preventDefault();
                            setOpen(true);
                        }}
                    >
                        <Pencil className="h-4 w-4" />
                        Edit details
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onSelect={(e) => {
                            e.preventDefault();
                            setConfirmOpen(true);
                        }}
                        className="text-destructive focus:text-destructive"
                    >
                        <Trash2 className="h-4 w-4" />
                        Delete song
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <SongModal
                orgId={orgId}
                song={song}
                open={open}
                onOpenChange={setOpen}
                storage={storage}
            />

            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogContent className="sm:max-w-120">
                    <DialogHeader>
                        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                            <AlertCircle className="h-6 w-6 text-destructive" />
                        </div>
                        <DialogTitle className="text-center text-xl text-destructive">
                            Delete Song
                        </DialogTitle>
                        <DialogDescription className="text-center text-muted-foreground">
                            <span className="font-semibold text-foreground">{song.title}</span>
                            {" by "}
                            <span className="font-semibold text-foreground">{song.artist}</span>
                            {" will be removed from the library and can no longer be added to setlists. Past setlists keep their copy."}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setConfirmOpen(false)}
                            disabled={isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={handleDelete}
                            disabled={isPending}
                        >
                            {isPending && <Spinner className="mr-2" />}
                            {isPending ? "Deleting..." : "Delete Song"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};
