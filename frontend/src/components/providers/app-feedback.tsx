"use client";

import {
  LogOut as LogOutIcon,
  Play as PlayIcon,
  Trash2 as Trash2Icon,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Toaster, toast } from "@/components/ui/sonner";

type ConfirmTone = "danger" | "warning" | "accent" | "success";

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

type ConfirmState = ConfirmOptions & {
  open: boolean;
};

type AppFeedbackContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  info: (title: string, description?: string) => void;
  success: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
};

const AppFeedbackContext = createContext<AppFeedbackContextValue | null>(null);

const defaultConfirm: ConfirmState = {
  open: false,
  title: "",
  message: "",
  confirmLabel: "Confirm",
  cancelLabel: "Cancel",
  tone: "accent",
};

export function AppFeedbackProvider({ children }: { children: ReactNode }) {
  const [confirmState, setConfirmState] = useState<ConfirmState>(defaultConfirm);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const closeConfirm = useCallback((value: boolean) => {
    setConfirmState((prev) => ({ ...prev, open: false }));
    resolverRef.current?.(value);
    resolverRef.current = null;
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setConfirmState({
        open: true,
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel ?? "Confirm",
        cancelLabel: options.cancelLabel ?? "Cancel",
        tone: options.tone ?? "accent",
      });
    });
  }, []);

  const value = useMemo<AppFeedbackContextValue>(
    () => ({
      confirm,
      info: (title, description) =>
        toast.info(title, description ? { description } : undefined),
      success: (title, description) =>
        toast.success(title, description ? { description } : undefined),
      warning: (title, description) =>
        toast.warning(title, description ? { description } : undefined),
      error: (title, description) =>
        toast.error(title, description ? { description } : undefined),
    }),
    [confirm],
  );

  return (
    <AppFeedbackContext.Provider value={value}>
      <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
        {children}
      </div>

      <Toaster position="top-center" closeButton />

      <AlertDialog
        open={confirmState.open}
        onOpenChange={(open) => {
          if (!open) closeConfirm(false);
        }}
      >
        <AlertDialogContent
          size="sm"
          className={
            confirmState.tone === "danger"
              ? "max-w-[22rem] gap-5 rounded-xl border-[#e7e5e4] bg-white p-5 shadow-xl"
              : "max-w-[22rem] gap-4 rounded-xl border-[#e7e5e4] bg-white p-5 text-[#111827] shadow-lg"
          }
        >
          <AlertDialogHeader>
            {confirmState.tone === "danger" ? (
              <AlertDialogMedia className="mb-1 size-11 rounded-lg bg-[#fde8e8] text-[#e11d48]">
                <Trash2Icon className="size-5" />
              </AlertDialogMedia>
            ) : null}
            {confirmState.tone === "warning" ? (
              <AlertDialogMedia className="mb-1 size-10 rounded-lg bg-[#f4f4f5] text-[#111827]">
                <LogOutIcon className="size-4" />
              </AlertDialogMedia>
            ) : null}
            {confirmState.tone === "accent" ? (
              <AlertDialogMedia className="mb-1 size-10 rounded-lg bg-[#eef2f6] text-[#1a2b4a]">
                <PlayIcon className="size-4" />
              </AlertDialogMedia>
            ) : null}
            <AlertDialogTitle className="text-base font-semibold text-[#111827]">
              {confirmState.title}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-balance text-[#6b7280]">
              {confirmState.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              variant="outline"
              className="h-9 rounded-lg border-[#e5e7eb] bg-white text-[#111827] shadow-none hover:border-[#d1d5db] hover:bg-[#f3f4f6] hover:text-[#111827]"
              onClick={() => closeConfirm(false)}
            >
              {confirmState.cancelLabel}
            </AlertDialogCancel>
            <AlertDialogAction
              variant={confirmState.tone === "danger" ? "destructive" : "default"}
              className={
                confirmState.tone === "danger"
                  ? "h-9 rounded-lg border-0 bg-[#fde8e8] text-[#e11d48] shadow-none hover:bg-[#fbd5d5]"
                  : confirmState.tone === "warning"
                    ? "h-9 rounded-lg border-0 bg-black text-white shadow-none hover:bg-black/90"
                    : "h-9 rounded-lg border-0 bg-[#1a2b4a] text-white shadow-none hover:bg-[#1a2b4a]/90"
              }
              onClick={() => closeConfirm(true)}
            >
              {confirmState.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppFeedbackContext.Provider>
  );
}

export function useAppFeedback() {
  const ctx = useContext(AppFeedbackContext);
  if (!ctx) {
    throw new Error("useAppFeedback must be used within AppFeedbackProvider");
  }
  return ctx;
}
