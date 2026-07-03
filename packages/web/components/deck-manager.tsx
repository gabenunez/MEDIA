"use client";

import { useState } from "react";
import {
  FolderPlus,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { api, type LibraryDeck, type SettingsLibrary } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderPicker } from "@/components/folder-picker";

interface DeckManagerProps {
  libraries: SettingsLibrary[];
  decks: LibraryDeck[];
  onChange: () => void;
}

export function DeckManager({ libraries, decks, onChange }: DeckManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LibraryDeck | null>(null);
  const [name, setName] = useState("");
  const [paths, setPaths] = useState<string[]>([]);
  const [libraryId, setLibraryId] = useState<number | null>(null);
  const [draftPath, setDraftPath] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const selectedLibrary = libraries.find((lib) => lib.id === libraryId) ?? null;

  const resetForm = () => {
    setShowForm(false);
    setEditing(null);
    setName("");
    setPaths([]);
    setLibraryId(libraries[0]?.id ?? null);
    setDraftPath("");
    setError(null);
  };

  const openCreate = () => {
    resetForm();
    setLibraryId(libraries[0]?.id ?? null);
    setShowForm(true);
  };

  const openEdit = (deck: LibraryDeck) => {
    setEditing(deck);
    setShowForm(true);
    setName(deck.name);
    setPaths(deck.paths);
    setLibraryId(libraries[0]?.id ?? null);
    setDraftPath("");
    setError(null);
  };

  const addPath = () => {
    const trimmed = draftPath.trim();
    if (!trimmed) return;
    if (paths.includes(trimmed)) {
      setError("This folder is already in the deck");
      return;
    }
    setPaths((current) => [...current, trimmed]);
    setDraftPath(selectedLibrary?.path ?? "");
    setError(null);
  };

  const removePath = (path: string) => {
    setPaths((current) => current.filter((entry) => entry !== path));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await api.updateDeck(editing.id, { name, paths });
      } else {
        await api.createDeck({ name, paths });
      }
      resetForm();
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save deck");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (deck: LibraryDeck) => {
    if (!confirm(`Remove deck "${deck.name}"? Your files stay on disk.`)) return;

    setDeleting(deck.id);
    try {
      await api.deleteDeck(deck.id);
      onChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete deck");
    } finally {
      setDeleting(null);
    }
  };

  if (!libraries.length) {
    return (
      <div className="rounded-md border border-dashed border-border px-6 py-8 text-center">
        <Layers className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <p className="mb-1 font-medium">Add a library first</p>
        <p className="text-sm text-muted-foreground">
          Decks are built from folders inside your media libraries.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Library Decks</h2>
          <p className="text-sm text-muted-foreground">
            Group titles from specific folders into custom browse collections.
          </p>
        </div>
        {!showForm && (
          <Button onClick={openCreate}>
            <FolderPlus className="h-4 w-4" />
            Add Deck
          </Button>
        )}
      </div>

      {showForm && (
        <div className="rounded-md border border-primary/35 bg-primary/10 p-5">
          <h3 className="mb-4 font-medium">
            {editing ? "Edit Deck" : "New Deck"}
          </h3>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Kids Movies"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Folders</label>
              <p className="mb-3 text-xs text-muted-foreground">
                Pick one or more folders from your libraries. Titles with files
                inside these folders appear in the deck.
              </p>

              {paths.length > 0 && (
                <div className="mb-3 space-y-2">
                  {paths.map((entry) => (
                    <div
                      key={entry}
                      className="flex items-center gap-2 rounded-md border border-border/80 bg-background/40 px-3 py-2"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm">{entry}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removePath(entry)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3 rounded-md border border-border/80 bg-background/35 p-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase text-muted-foreground">
                    Source library
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {libraries.map((lib) => (
                      <Button
                        key={lib.id}
                        type="button"
                        variant={libraryId === lib.id ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          setLibraryId(lib.id);
                          setDraftPath(lib.path);
                        }}
                      >
                        {lib.name}
                      </Button>
                    ))}
                  </div>
                </div>

                {selectedLibrary && (
                  <FolderPicker
                    value={draftPath}
                    onChange={setDraftPath}
                    rootPath={selectedLibrary.path}
                    validateScope="deck"
                    libraryId={selectedLibrary.id}
                  />
                )}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!draftPath.trim()}
                  onClick={addPath}
                >
                  <Plus className="h-4 w-4" />
                  Add folder
                </Button>
              </div>
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex gap-2">
              <Button
                onClick={handleSave}
                disabled={saving || !name.trim() || paths.length === 0}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {editing ? "Save changes" : "Create deck"}
              </Button>
              <Button variant="outline" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {decks.map((deck) => (
          <div
            key={deck.id}
            className="rounded-md border border-border/80 bg-background/35 p-4"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" />
                  <p className="font-medium">{deck.name}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {deck.itemCount} titles / {deck.paths.length} folder
                  {deck.paths.length === 1 ? "" : "s"}
                  {deck.libraryNames.length
                    ? ` / ${deck.libraryNames.join(", ")}`
                    : ""}
                </p>
                <div className="mt-2 space-y-1">
                  {deck.paths.map((entry) => (
                    <p key={entry} className="truncate text-xs text-muted-foreground">
                      {entry}
                    </p>
                  ))}
                </div>
              </div>

              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={() => openEdit(deck)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={deleting === deck.id}
                  onClick={() => handleDelete(deck)}
                >
                  {deleting === deck.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        ))}

        {!decks.length && !showForm && (
          <div className="rounded-md border border-dashed border-border px-6 py-10 text-center">
            <Layers className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="mb-1 font-medium">No custom decks yet</p>
            <p className="mb-4 text-sm text-muted-foreground">
              Create a deck to browse a hand-picked set of folders.
            </p>
            <Button onClick={openCreate}>Create your first deck</Button>
          </div>
        )}
      </div>
    </div>
  );
}
