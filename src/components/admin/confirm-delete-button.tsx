"use client";

import { Button } from "@/components/ui/button";

type ConfirmDeleteButtonProps = {
  confirmMessage: string;
  label?: string;
};

// Client wrapper so we can attach onSubmit confirm() to a server action form.
// Server Components can't pass inline event handlers, so this small client
// boundary handles just the confirm() check before letting the form submit
// through to the server action normally.
export function ConfirmDeleteButton({ confirmMessage, label = "Delete" }: ConfirmDeleteButtonProps) {
  return (
    <Button
      type="submit"
      variant="ghost"
      className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
      onClick={(e) => {
        if (!confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      {label}
    </Button>
  );
}