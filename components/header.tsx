'use client'

import { Button } from '@/components/ui/button'
import { Plus, Search, Settings, Sparkles, Menu, Download, Upload, Share2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet'

interface HeaderProps {
  onAddMember: () => void
  onSearch: () => void
  onAIInsights: () => void
  onExport?: () => void
  onImport?: () => void
  onSettings?: () => void
}

export function Header({ 
  onAddMember, 
  onSearch, 
  onAIInsights,
  onExport,
  onImport,
  onSettings,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-card/95 backdrop-blur-md supports-[backdrop-filter]:bg-card/80">
      <div className="flex h-16 items-center justify-between px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary shadow-lg shadow-primary/20">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-6 w-6 text-primary-foreground"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="7" r="3" />
              <circle cx="6" cy="17" r="2.5" />
              <circle cx="18" cy="17" r="2.5" />
              <path d="M12 10v3M8 14l-1.5 2M16 14l1.5 2" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Outverse</h1>
            <p className="text-xs text-muted-foreground">The Living Family Intelligence Network</p>
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-1 md:flex">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onSearch}
            className="text-muted-foreground hover:text-foreground hover:bg-muted/50"
          >
            <Search className="mr-2 h-4 w-4" />
            Search
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onAIInsights}
            className="text-muted-foreground hover:text-foreground hover:bg-muted/50"
          >
            <Sparkles className="mr-2 h-4 w-4 text-accent" />
            AI Insights
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm"
                className="text-muted-foreground hover:text-foreground hover:bg-muted/50"
              >
                <Settings className="mr-2 h-4 w-4" />
                More
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={onExport}>
                <Download className="mr-2 h-4 w-4" />
                Export Tree
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onImport}>
                <Upload className="mr-2 h-4 w-4" />
                Import Data
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Share2 className="mr-2 h-4 w-4" />
                Share
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onSettings}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button 
            size="sm" 
            onClick={onAddMember}
            className="ml-2 bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 shadow-md shadow-primary/20"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Member
          </Button>
        </nav>

        {/* Mobile Navigation */}
        <div className="flex items-center gap-2 md:hidden">
          <Button 
            size="icon" 
            variant="ghost"
            onClick={onSearch}
            className="text-muted-foreground"
          >
            <Search className="h-5 w-5" />
          </Button>
          <Button 
            size="icon"
            onClick={onAddMember}
            className="bg-gradient-to-r from-primary to-secondary"
          >
            <Plus className="h-5 w-5" />
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button size="icon" variant="ghost" className="text-muted-foreground">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <div className="flex flex-col gap-2 mt-8">
                <Button variant="ghost" className="justify-start" onClick={onAIInsights}>
                  <Sparkles className="mr-2 h-4 w-4 text-accent" />
                  AI Insights
                </Button>
                <Button variant="ghost" className="justify-start" onClick={onExport}>
                  <Download className="mr-2 h-4 w-4" />
                  Export Tree
                </Button>
                <Button variant="ghost" className="justify-start" onClick={onImport}>
                  <Upload className="mr-2 h-4 w-4" />
                  Import Data
                </Button>
                <Button variant="ghost" className="justify-start">
                  <Share2 className="mr-2 h-4 w-4" />
                  Share
                </Button>
                <Button variant="ghost" className="justify-start" onClick={onSettings}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
