import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

interface StatsCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  description?: string
  // Tints the description to flag something that needs attention.
  highlight?: boolean
  trend?: {
    value: string
    positive: boolean
  }
};

export function StatsCard({ title, value, icon: Icon, description, highlight = false, trend }: StatsCardProps) {
  return (
    <Card className="group relative overflow-hidden border-border/40 bg-linear-to-br from-card to-card/80 transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
      <div className="absolute inset-0 bg-linear-to-br from-transparent via-transparent to-primary/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <CardContent className="relative p-4 sm:p-6">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-2 sm:space-y-3">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold tracking-tight sm:text-3xl">{value}</p>
              {trend && (
                <span
                  className={cn(
                    "flex items-center gap-0.5 text-xs font-semibold",
                    trend.positive ? "text-chart-1" : "text-destructive",
                  )}
                >
                  {trend.positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {trend.value}
                </span>
              )}
            </div>
            {description && (
              <p className={cn("text-xs", highlight ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                {description}
              </p>
            )}
          </div>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 transition-transform duration-200 group-hover:scale-110 sm:size-12">
            <Icon className="h-5 w-5 text-primary sm:h-6 sm:w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
