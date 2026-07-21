

import * as React from "react"
import { CheckIcon, PlusCircleIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface DataTableFacetedFilterProps {
    title?: string
    options: {
        label: string
        value: string
        icon?: React.ComponentType<{ className?: string }>
    }[]
    value?: string
    onChange: (value: string) => void
}

export function DataTableFacetedFilter({
    title,
    options,
    value,
    onChange,
}: DataTableFacetedFilterProps) {
    const selectedValues = new Set(value && value !== 'all' ? [value] : [])

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-12 border-slate-200 dark:border-white/10 rounded-md hover:bg-slate-50 dark:hover:bg-white/5 transition-all">
                    <PlusCircleIcon className="mr-2 h-4 w-4" />
                    {title}
                    {selectedValues.size > 0 && (
                        <>
                            <DropdownMenuSeparator className="mx-2 h-4 w-[1px]" />
                            <Badge
                                variant="secondary"
                                className="rounded-sm px-1 font-normal lg:hidden"
                            >
                                {selectedValues.size}
                            </Badge>
                            <div className="hidden space-x-1 lg:flex">
                                {selectedValues.size > 2 ? (
                                    <Badge
                                        variant="secondary"
                                        className="rounded-sm px-1 font-normal"
                                    >
                                        {selectedValues.size} selected
                                    </Badge>
                                ) : (
                                    options
                                        .filter((option) => selectedValues.has(option.value))
                                        .map((option) => (
                                            <Badge
                                                variant="secondary"
                                                key={option.value}
                                                className="rounded-sm px-1 font-normal"
                                            >
                                                {option.label}
                                            </Badge>
                                        ))
                                )}
                            </div>
                        </>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[200px] p-2">
                <DropdownMenuLabel>{title}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {options.map((option) => {
                    const isSelected = selectedValues.has(option.value)
                    return (
                        <DropdownMenuCheckboxItem
                            key={option.value}
                            checked={isSelected}
                            onCheckedChange={() => onChange(isSelected ? 'all' : option.value)}
                            className="rounded-lg"
                        >
                            <div className="flex items-center">
                                {option.icon && (
                                    <option.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                                )}
                                <span>{option.label}</span>
                            </div>
                        </DropdownMenuCheckboxItem>
                    )
                })}
                {selectedValues.size > 0 && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={() => onChange('all')}
                            className="justify-center text-center font-normal"
                        >
                            Clear filters
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
