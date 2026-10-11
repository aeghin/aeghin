"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Settings2 } from "lucide-react";
import { updateOrganizationDetails } from "@/lib/actions/organizations";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";

import {
  OrganizationInput,
  organizationSchema,
} from "@/lib/validations/organization";
import { timeZoneLabel } from "@/lib/time-zone";

interface EditSettingsDialogProps {
  organizationId: string;
  name: string;
  description: string;
  timeZone: string;
};

// Where nearly every organization is, first, by the names people use for them.
// Outside the component: static.
const US_TIME_ZONES = [
  { value: "America/New_York", label: "Eastern Time (New York)" },
  { value: "America/Chicago", label: "Central Time (Chicago)" },
  { value: "America/Denver", label: "Mountain Time (Denver)" },
  { value: "America/Phoenix", label: "Arizona (Phoenix)" },
  { value: "America/Los_Angeles", label: "Pacific Time (Los Angeles)" },
  { value: "America/Anchorage", label: "Alaska (Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
  { value: "America/Puerto_Rico", label: "Atlantic (Puerto Rico)" },
];

/**
 * Every other zone this browser knows, plus whichever one is set if the list
 * leaves it out — Chrome's has no "UTC". Only read once the dialog is open, so
 * it never renders on the server.
 */
const otherTimeZones = (current: string) => {
  const us = new Set(US_TIME_ZONES.map((zone) => zone.value));
  // Safari before 15.4 has no list to offer; the US zones and the current one
  // still cover it.
  const all =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : [];
  const zones = all.includes(current) || us.has(current) ? all : [current, ...all];

  return zones.filter((zone) => !us.has(zone));
};

export const EditSettingsDialog = ({
  organizationId,
  name,
  description,
  timeZone,
}: EditSettingsDialogProps) => {

  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const form = useForm<OrganizationInput>({
    resolver: zodResolver(organizationSchema),
    values: { name, description, timeZone },
  });

  const handleOpenChange = (next: boolean) => {
    if (!next) form.reset();
    setOpen(next);
  };

  const { isValid } = form.formState;

  const handleSubmit = (values: OrganizationInput) => {
      startTransition(async () => {
        const result = await updateOrganizationDetails(organizationId, values);

        if (result.success) {
          toast.success("Details Updated!", { position: "top-center" });
          form.reset();
          handleOpenChange(false);
        } else {
          toast.error(result.error)
        }; 
      });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 cursor-pointer hover:bg-background/10"
        >
          <Pencil className="mr-2 h-3.5 w-3.5" />
          Edit Details
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-120">
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Settings2 className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center text-xl">
            Edit Organization
          </DialogTitle>
          <DialogDescription className="text-center">
            Update your organization&apos;s name, description and time zone.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4 py-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Organization Name</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={isPending} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} disabled={isPending} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="timeZone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Time Zone</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isPending}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full cursor-pointer">
                        <SelectValue placeholder="Choose a time zone">
                          {field.value ? timeZoneLabel(field.value) : null}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="max-h-72">
                      <SelectGroup>
                        <SelectLabel>United States</SelectLabel>
                        {US_TIME_ZONES.map((zone) => (
                          <SelectItem key={zone.value} value={zone.value}>
                            {zone.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel>All time zones</SelectLabel>
                        {otherTimeZones(timeZone).map((zone) => (
                          <SelectItem key={zone} value={zone}>
                            {zone.replaceAll("_", " ")}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Where your services happen. Reminders and emails go out on this
                    clock, and events end on it.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || !isValid} size="sm">
                {isPending && <Spinner className="mr-2" />}
                {isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
