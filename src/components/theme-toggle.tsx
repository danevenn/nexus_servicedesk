"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Cambiar tema"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      <Sun className="size-4 scale-100 dark:scale-0 dark:-rotate-90 transition-transform" />
      <Moon className="absolute size-4 scale-0 dark:scale-100 rotate-90 dark:rotate-0 transition-transform" />
    </Button>
  );
}
