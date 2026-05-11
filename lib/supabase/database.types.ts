export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      families: {
        Row: {
          id: string
          name: string
          invite_code: string
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          invite_code: string
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['families']['Insert']>
      }
      family_members: {
        Row: {
          id: string
          family_id: string
          name: string
          birth_year: number | null
          death_year: number | null
          birth_place: string | null
          current_place: string | null
          photo_url: string | null
          bio: string | null
          relationship: string | null
          occupation: string | null
          parent_ids: string[]
          spouse_ids: string[]
          generation: number
          is_alive: boolean
          gender: string | null
          tags: string[]
          side: string | null
          role: string | null
          gotra: string | null
          caste: string | null
          hometown: string | null
          native_language: string | null
          religion: string | null
          phone: string | null
          email: string | null
          added_by: string | null
          added_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          family_id: string
          name: string
          birth_year?: number | null
          death_year?: number | null
          birth_place?: string | null
          current_place?: string | null
          photo_url?: string | null
          bio?: string | null
          relationship?: string | null
          occupation?: string | null
          parent_ids?: string[]
          spouse_ids?: string[]
          generation?: number
          is_alive?: boolean
          gender?: string | null
          tags?: string[]
          side?: string | null
          role?: string | null
          gotra?: string | null
          caste?: string | null
          hometown?: string | null
          native_language?: string | null
          religion?: string | null
          phone?: string | null
          email?: string | null
          added_by?: string | null
          added_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['family_members']['Insert']>
      }
      stories: {
        Row: {
          id: string
          family_id: string
          member_id: string
          title: string
          content: string
          date: string | null
          author: string | null
          ai_generated: boolean
          language: string | null
          created_at: string
        }
        Insert: {
          id?: string
          family_id: string
          member_id: string
          title: string
          content: string
          date?: string | null
          author?: string | null
          ai_generated?: boolean
          language?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['stories']['Insert']>
      }
      memories: {
        Row: {
          id: string
          family_id: string
          title: string
          description: string | null
          photo_url: string | null
          event_type: string
          year: number | null
          date: string | null
          tagged_member_ids: string[]
          uploaded_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          family_id: string
          title: string
          description?: string | null
          photo_url?: string | null
          event_type: string
          year?: number | null
          date?: string | null
          tagged_member_ids?: string[]
          uploaded_by?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['memories']['Insert']>
      }
      voice_notes: {
        Row: {
          id: string
          family_id: string
          member_id: string
          title: string
          duration_seconds: number
          file_url: string | null
          transcription: string | null
          translation: string | null
          language: string | null
          recorded_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          family_id: string
          member_id: string
          title: string
          duration_seconds: number
          file_url?: string | null
          transcription?: string | null
          translation?: string | null
          language?: string | null
          recorded_by?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['voice_notes']['Insert']>
      }
      events: {
        Row: {
          id: string
          family_id: string
          title: string
          description: string | null
          event_date: string
          location: string | null
          created_by: string | null
          rsvps: Json
          created_at: string
        }
        Insert: {
          id?: string
          family_id: string
          title: string
          description?: string | null
          event_date: string
          location?: string | null
          created_by?: string | null
          rsvps?: Json
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['events']['Insert']>
      }
      invite_links: {
        Row: {
          id: string
          family_id: string
          code: string
          role: string
          created_by: string
          expires_at: string | null
          used_count: number
          max_uses: number | null
          created_at: string
        }
        Insert: {
          id?: string
          family_id: string
          code: string
          role?: string
          created_by: string
          expires_at?: string | null
          used_count?: number
          max_uses?: number | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['invite_links']['Insert']>
      }
      profiles: {
        Row: {
          id: string
          family_id: string | null
          member_id: string | null
          display_name: string | null
          avatar_url: string | null
          phone: string | null
          role: string
          created_at: string
        }
        Insert: {
          id: string
          family_id?: string | null
          member_id?: string | null
          display_name?: string | null
          avatar_url?: string | null
          phone?: string | null
          role?: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
