'use client'

import { useMemo } from 'react'
import { FamilyMember } from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { 
  BookOpen, 
  Calendar, 
  Heart, 
  MapPin, 
  Sparkles, 
  Users, 
  TrendingUp,
  Lightbulb,
  Globe,
  Briefcase,
  GraduationCap,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface AIInsightsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  members: FamilyMember[]
}

export function AIInsightsDialog({
  open,
  onOpenChange,
  members,
}: AIInsightsDialogProps) {
  const stats = useMemo(() => {
    const livingMembers = members.filter((m) => !m.deathYear).length
    const totalMembers = members.length
    const generations = new Set(members.map((m) => m.generation)).size
    const withStories = members.filter((m) => m.stories && m.stories.length > 0).length
    const withMilestones = members.filter((m) => m.milestones && m.milestones.length > 0).length
    
    return { livingMembers, totalMembers, generations, withStories, withMilestones }
  }, [members])

  const oldestMember = useMemo(() => {
    return members.reduce((oldest, m) => {
      if (!m.birthYear) return oldest
      if (!oldest || (m.birthYear < (oldest.birthYear || Infinity))) return m
      return oldest
    }, null as FamilyMember | null)
  }, [members])

  const youngestMember = useMemo(() => {
    return members.reduce((youngest, m) => {
      if (!m.birthYear) return youngest
      if (!youngest || (m.birthYear > (youngest.birthYear || 0))) return m
      return youngest
    }, null as FamilyMember | null)
  }, [members])

  const birthplaceStats = useMemo(() => {
    const places: Record<string, number> = {}
    members.forEach((m) => {
      if (m.birthPlace) {
        const place = m.birthPlace.split(',').pop()?.trim() || m.birthPlace
        places[place] = (places[place] || 0) + 1
      }
    })
    return Object.entries(places)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
  }, [members])

  const occupationStats = useMemo(() => {
    const occupations: Record<string, number> = {}
    members.forEach((m) => {
      if (m.occupation) {
        occupations[m.occupation] = (occupations[m.occupation] || 0) + 1
      }
    })
    return Object.entries(occupations)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
  }, [members])

  const yearSpan = useMemo(() => {
    const births = members.filter((m) => m.birthYear).map((m) => m.birthYear!)
    if (births.length === 0) return null
    return {
      earliest: Math.min(...births),
      latest: Math.max(...births),
      span: Math.max(...births) - Math.min(...births),
    }
  }, [members])

  const completenessScore = useMemo(() => {
    let total = 0
    let filled = 0
    members.forEach((m) => {
      total += 6
      if (m.name) filled++
      if (m.birthYear) filled++
      if (m.birthPlace) filled++
      if (m.bio) filled++
      if (m.occupation) filled++
      if (m.stories && m.stories.length > 0) filled++
    })
    return Math.round((filled / total) * 100)
  }, [members])

  const suggestedActions = useMemo(() => {
    const actions = []
    const missingBio = members.filter((m) => !m.bio).length
    const missingBirthplace = members.filter((m) => !m.birthPlace).length
    const missingStories = members.filter((m) => !m.stories || m.stories.length === 0).length

    if (missingBio > 0) {
      actions.push({
        icon: BookOpen,
        title: 'Add biographies',
        description: `${missingBio} members are missing biographies`,
        priority: 'medium',
      })
    }
    if (missingBirthplace > 0) {
      actions.push({
        icon: MapPin,
        title: 'Add birthplaces',
        description: `${missingBirthplace} members are missing birthplace data`,
        priority: 'low',
      })
    }
    if (missingStories > 0) {
      actions.push({
        icon: Sparkles,
        title: 'Record family stories',
        description: `${missingStories} members have no stories yet`,
        priority: 'high',
      })
    }
    return actions
  }, [members])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] p-0 gap-0">
        <DialogHeader className="p-6 pb-4 border-b border-border/50">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            Family Intelligence
          </DialogTitle>
          <DialogDescription>
            AI-powered insights, patterns, and suggestions for your family tree
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="overview" className="flex-1">
          <TabsList className="w-full rounded-none border-b border-border/50 bg-transparent h-auto p-0 px-6">
            <TabsTrigger 
              value="overview" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger 
              value="insights" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3"
            >
              Insights
            </TabsTrigger>
            <TabsTrigger 
              value="patterns" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3"
            >
              Patterns
            </TabsTrigger>
            <TabsTrigger 
              value="suggestions" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3"
            >
              Suggestions
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[calc(85vh-180px)]">
            <TabsContent value="overview" className="p-6 mt-0 space-y-6">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="bg-muted/30 border-border/50">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="h-4 w-4 text-primary" />
                      <span className="text-2xl font-bold text-foreground">{stats.totalMembers}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Total Members</p>
                  </CardContent>
                </Card>
                <Card className="bg-muted/30 border-border/50">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Heart className="h-4 w-4 text-pink-500" />
                      <span className="text-2xl font-bold text-foreground">{stats.livingMembers}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Living Members</p>
                  </CardContent>
                </Card>
                <Card className="bg-muted/30 border-border/50">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="h-4 w-4 text-secondary" />
                      <span className="text-2xl font-bold text-foreground">{stats.generations}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Generations</p>
                  </CardContent>
                </Card>
                <Card className="bg-muted/30 border-border/50">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <BookOpen className="h-4 w-4 text-accent" />
                      <span className="text-2xl font-bold text-foreground">{stats.withStories}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">With Stories</p>
                  </CardContent>
                </Card>
              </div>

              {/* Completeness Score */}
              <Card className="bg-muted/30 border-border/50">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-foreground">Tree Completeness</span>
                    <span className="text-sm font-bold text-primary">{completenessScore}%</span>
                  </div>
                  <Progress value={completenessScore} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-2">
                    Add more details like bios, birthplaces, and stories to improve your family record
                  </p>
                </CardContent>
              </Card>

              {/* Timeline */}
              {yearSpan && (
                <Card className="bg-muted/30 border-border/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      Family Timeline
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-center">
                        <p className="text-lg font-bold text-foreground">{yearSpan.earliest}</p>
                        <p className="text-xs text-muted-foreground">Earliest Birth</p>
                      </div>
                      <div className="flex-1 mx-4 h-1 bg-gradient-to-r from-primary via-secondary to-accent rounded-full" />
                      <div className="text-center">
                        <p className="text-lg font-bold text-foreground">{yearSpan.latest}</p>
                        <p className="text-xs text-muted-foreground">Latest Birth</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground text-center mt-2">
                      {yearSpan.span} years of family history documented
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Oldest & Youngest */}
              <div className="grid grid-cols-2 gap-3">
                {oldestMember && (
                  <Card className="bg-muted/30 border-border/50">
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground mb-2">Earliest Documented</p>
                      <p className="font-semibold text-foreground">{oldestMember.name}</p>
                      <p className="text-sm text-muted-foreground">Born {oldestMember.birthYear}</p>
                    </CardContent>
                  </Card>
                )}
                {youngestMember && (
                  <Card className="bg-muted/30 border-border/50">
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground mb-2">Youngest Member</p>
                      <p className="font-semibold text-foreground">{youngestMember.name}</p>
                      <p className="text-sm text-muted-foreground">Born {youngestMember.birthYear}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            <TabsContent value="insights" className="p-6 mt-0 space-y-4">
              <Card className="bg-gradient-to-br from-primary/10 to-secondary/10 border-primary/20">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                      <Globe className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground mb-1">Multicultural Heritage</h4>
                      <p className="text-sm text-muted-foreground">
                        Your family spans multiple cultural backgrounds including Irish and Mexican heritage,
                        with immigration stories dating back to the 1950s. This rich tapestry of origins
                        contributes to your family&apos;s unique identity.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-muted/30 border-border/50">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-lg bg-accent/20 flex items-center justify-center shrink-0">
                      <Heart className="h-4 w-4 text-accent" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground mb-1">Family Traditions</h4>
                      <p className="text-sm text-muted-foreground">
                        Several family traditions have been passed down through generations, including 
                        Margaret&apos;s famous apple pie recipe and summer beach vacations started by Susan.
                        These traditions create lasting bonds across generations.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-muted/30 border-border/50">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-lg bg-secondary/20 flex items-center justify-center shrink-0">
                      <GraduationCap className="h-4 w-4 text-secondary" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground mb-1">Educational Legacy</h4>
                      <p className="text-sm text-muted-foreground">
                        Robert Wilson was the first in the family to attend college, setting a precedent
                        that continues today. Your family values education highly, with multiple members
                        pursuing higher education.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="patterns" className="p-6 mt-0 space-y-6">
              {/* Geographic Distribution */}
              {birthplaceStats.length > 0 && (
                <Card className="bg-muted/30 border-border/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      Geographic Origins
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {birthplaceStats.map(([place, count]) => (
                      <div key={place} className="flex items-center justify-between">
                        <span className="text-sm text-foreground">{place}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${(count / stats.totalMembers) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-6">{count}</span>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Occupations */}
              {occupationStats.length > 0 && (
                <Card className="bg-muted/30 border-border/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Briefcase className="h-4 w-4 text-muted-foreground" />
                      Occupational Patterns
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {occupationStats.map(([occupation, count]) => (
                        <Badge 
                          key={occupation} 
                          variant="outline" 
                          className="bg-muted/50"
                        >
                          {occupation}
                          <span className="ml-1 text-muted-foreground">({count})</span>
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                      A passion for building runs through your family — from James the carpenter to
                      Robert the engineer to Michael the software developer.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Generation Breakdown */}
              <Card className="bg-muted/30 border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    Generation Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[0, 1, 2, 3].map((gen) => {
                      const genMembers = members.filter((m) => m.generation === gen)
                      const labels = ['Great Grandparents', 'Grandparents', 'Parents', 'Your Generation']
                      if (genMembers.length === 0) return null
                      return (
                        <div key={gen} className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-32">{labels[gen]}</span>
                          <div className="flex-1 flex gap-1">
                            {genMembers.map((m) => (
                              <div 
                                key={m.id}
                                className={cn(
                                  "h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-medium",
                                  m.deathYear 
                                    ? "bg-muted/50 text-muted-foreground" 
                                    : "bg-primary/20 text-primary"
                                )}
                                title={m.name}
                              >
                                {m.name.split(' ').map(n => n[0]).join('')}
                              </div>
                            ))}
                          </div>
                          <span className="text-xs text-muted-foreground">{genMembers.length}</span>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="suggestions" className="p-6 mt-0 space-y-4">
              <p className="text-sm text-muted-foreground mb-4">
                Here are some suggestions to enrich your family tree:
              </p>
              
              {suggestedActions.map((action, index) => (
                <Card 
                  key={index} 
                  className={cn(
                    "border-border/50",
                    action.priority === 'high' && "bg-accent/5 border-accent/20",
                    action.priority === 'medium' && "bg-primary/5 border-primary/20",
                    action.priority === 'low' && "bg-muted/30"
                  )}
                >
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                        action.priority === 'high' && "bg-accent/20",
                        action.priority === 'medium' && "bg-primary/20",
                        action.priority === 'low' && "bg-muted"
                      )}>
                        <action.icon className={cn(
                          "h-4 w-4",
                          action.priority === 'high' && "text-accent",
                          action.priority === 'medium' && "text-primary",
                          action.priority === 'low' && "text-muted-foreground"
                        )} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-foreground">{action.title}</h4>
                          <Badge 
                            variant="outline" 
                            className={cn(
                              "text-[10px]",
                              action.priority === 'high' && "border-accent/50 text-accent",
                              action.priority === 'medium' && "border-primary/50 text-primary",
                              action.priority === 'low' && "border-border text-muted-foreground"
                            )}
                          >
                            {action.priority}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{action.description}</p>
                      </div>
                      <Button variant="outline" size="sm" className="shrink-0">
                        Start
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}

              <Card className="bg-gradient-to-br from-primary/10 to-secondary/10 border-primary/20">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <Lightbulb className="h-5 w-5 text-accent" />
                    <div>
                      <h4 className="font-semibold text-foreground mb-1">AI Story Generator</h4>
                      <p className="text-sm text-muted-foreground">
                        Use AI to help write compelling stories based on the facts you&apos;ve recorded.
                        Select a family member and click &quot;AI Story&quot; to get started.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
