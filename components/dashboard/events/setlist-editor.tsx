"use client"

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { colorClasses } from "@/lib/config/service-types-config";
import { saveSetlist } from "@/lib/actions/song-setlist";
import { SetlistDraft } from "./setlist-draft";
import { CatalogPicker } from "./song-catalog-picker";
import { AiSetlistPanel } from "./ai-setlist-panel";
import { AiSetlistUpgrade } from "./ai-setlist-upgrade";
import { AiSetlistProUpsell } from "./ai-setlist-pro-upsell";
import type { SetlistSong } from "@/lib/types";
import { Song } from "@/generated/prisma/client";

interface SetlistEditorProps {
  eventId: string
  eventName: string
  orgId: string
  backHref: string
  initialSongs: SetlistSong[]
  serviceColor: string
  catalog: Song[]
  canUseAi: boolean
  hasPro: boolean
  canSubscribe: boolean
}

export function SetlistEditor({
  eventId,
  eventName,
  orgId,
  backHref,
  initialSongs,
  serviceColor,
  catalog,
  canUseAi,
  hasPro,
  canSubscribe
}: SetlistEditorProps) {
  const serviceColors = colorClasses[serviceColor];
  const router = useRouter();
  const [songs, setSongs] = useState<SetlistSong[]>(initialSongs);
  const [isDirty, setIsDirty] = useState(false);
  const [isPending, startTransition] = useTransition();

  const allKeysSet = songs.every((s) => s.pitch && s.keyQuality);
  const canSave = isDirty && allKeysSet;

  const handleSave = () => {

  startTransition(async () => {
    const result = await saveSetlist(eventId, songs)

    if (result.success) {
      toast.success("Setlist saved", { position: "top-center" });
      setIsDirty(false)
      router.push(backHref)
    } else {
      toast.error(result.error, { position: "top-center" });
    }
  })
};

  const addSongs = (newSongs: SetlistSong[]) => {
    setSongs((prev) => [...prev, ...newSongs]);
    setIsDirty(true)
  };

  const updateSongs = (updatedSongs: SetlistSong[]) => {
    setSongs(updatedSongs)
    setIsDirty(true)
  };
  
  return (
    <div className="min-h-screen bg-muted/10">
      {/* Below the org top bar (h-14), which already says where this is and
          links back to the event. */}
      <header className="sticky top-14 z-10 border-b bg-background/80 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-3">
          <h1 className="min-w-0 truncate text-sm font-semibold">{eventName}</h1>

          <Button
            size="sm"
            onClick={handleSave}
            disabled={!canSave || isPending}
            className={cn("cursor-pointer", serviceColors.solid, serviceColors.solidHover)}
          >
            <Save className="mr-1.5 h-3.5 w-3.5" />
            Save
          </Button>
        </div>
      </header>

      <div className="container mx-auto grid grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <SetlistDraft
            songs={songs}
            onChange={updateSongs}
            serviceColor={serviceColor}
          />
        </section>

        <aside className="lg:col-span-1">
          <Tabs defaultValue={canUseAi ? "ai" : "catalog"} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="catalog">Catalog</TabsTrigger>
              <TabsTrigger value="ai">
                <Sparkles />
                AI
                {!canUseAi && <Lock className="size-3 text-muted-foreground" />}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="catalog" className="mt-3">
              <CatalogPicker
                catalog={catalog}
                draftSongIds={new Set(songs.map((s) => s.songId))}
                onAdd={addSongs}
                serviceColor={serviceColor}
              />
            </TabsContent>
            <TabsContent value="ai" className="mt-3 space-y-3">
              {canUseAi ? (
                <>
                  {!hasPro && (
                    <AiSetlistProUpsell
                      orgId={orgId}
                      canSubscribe={canSubscribe}
                    />
                  )}
                  <AiSetlistPanel
                    eventId={eventId}
                    orgId={orgId}
                    onApply={updateSongs}
                    serviceColor={serviceColor}
                  />
                </>
              ) : (
                <AiSetlistUpgrade orgId={orgId} canSubscribe={canSubscribe} />
              )}
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
  )
}