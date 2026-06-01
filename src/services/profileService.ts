import { supabase } from "@/lib/supabase";
import { mockFullProfile } from "@/mocks/mockData";

const isMockMode = () => import.meta.env.VITE_MOCK_MODE === "true";

// ==================== TYPES ====================

export interface WorkExperience {
  id: string;
  user_id: string;
  company_name: string;
  role_title: string;
  employment_type: string;
  location_type: string;
  start_date: string;
  end_date?: string;
  is_current: boolean;
  description?: string;
  achievements: string[];
  skills_used?: string[];
  company_size?: string;
  industry?: string;
  created_at: string;
  updated_at: string;
}

export interface Education {
  id: string;
  user_id: string;
  institution: string;
  degree: string;
  field_of_study?: string;
  start_year?: number;
  end_year?: number;
  is_current: boolean;
  gpa?: number;
  max_gpa?: number;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface Certification {
  id: string;
  user_id: string;
  name: string;
  issuer: string;
  issue_date?: string;
  expiry_date?: string;
  credential_id?: string;
  credential_url?: string;
  is_verified: boolean;
  category?: string;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  role?: string;
  tech_stack?: string[];
  project_url?: string;
  repo_url?: string;
  image_url?: string;
  start_date?: string;
  end_date?: string;
  is_featured: boolean;
  impact_metrics: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface Achievement {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  category?: string;
  issuer?: string;
  achievement_date?: string;
  url?: string;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserSkill {
  id: string;
  user_id: string;
  name: string;
  category: string;
  proficiency_level: number;
  years_experience?: number;
  is_verified: boolean;
  source?: string;
  created_at: string;
  updated_at: string;
}

export interface EventActivity {
  id: string;
  user_id: string;
  name: string;
  event_type: string;
  organizer?: string;
  role?: string;
  start_date?: string;
  end_date?: string;
  location?: string;
  description?: string;
  certificate_url?: string;
  created_at: string;
  updated_at: string;
}

export interface FullProfile {
  profile: any;
  workExperiences: WorkExperience[];
  education: Education[];
  certifications: Certification[];
  projects: Project[];
  achievements: Achievement[];
  skills: UserSkill[];
  events: EventActivity[];
}

// ==================== SERVICE ====================

export const profileService = {
  // Fetch full profile
  async getFullProfile(userId: string): Promise<FullProfile> {
    if (isMockMode()) {
      return mockFullProfile as unknown as FullProfile;
    }

    const [
      { data: profile },
      { data: workExperiences },
      { data: education },
      { data: certifications },
      { data: projects },
      { data: achievements },
      { data: skills },
      { data: events },
    ] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).single(),
      supabase.from("work_experiences").select("*").eq("user_id", userId).order("start_date", { ascending: false }),
      supabase.from("education").select("*").eq("user_id", userId).order("start_year", { ascending: false }),
      supabase.from("certifications").select("*").eq("user_id", userId).order("issue_date", { ascending: false }),
      supabase.from("projects").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("achievements").select("*").eq("user_id", userId).order("achievement_date", { ascending: false }),
      supabase.from("user_skills").select("*").eq("user_id", userId).order("proficiency_level", { ascending: false }),
      supabase.from("events_activities").select("*").eq("user_id", userId).order("start_date", { ascending: false }),
    ]);

    return {
      profile: profile || {},
      workExperiences: workExperiences || [],
      education: education || [],
      certifications: certifications || [],
      projects: projects || [],
      achievements: achievements || [],
      skills: skills || [],
      events: events || [],
    };
  },

  // Work Experiences CRUD
  async createWorkExperience(data: Omit<WorkExperience, "id" | "user_id" | "created_at" | "updated_at">) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    return supabase.from("work_experiences").insert({ ...data, user_id: user.id }).select().single();
  },
  async updateWorkExperience(id: string, data: Partial<WorkExperience>) {
    return supabase.from("work_experiences").update(data).eq("id", id).select().single();
  },
  async deleteWorkExperience(id: string) {
    return supabase.from("work_experiences").delete().eq("id", id);
  },

  // Education CRUD
  async createEducation(data: Omit<Education, "id" | "user_id" | "created_at" | "updated_at">) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    return supabase.from("education").insert({ ...data, user_id: user.id }).select().single();
  },
  async updateEducation(id: string, data: Partial<Education>) {
    return supabase.from("education").update(data).eq("id", id).select().single();
  },
  async deleteEducation(id: string) {
    return supabase.from("education").delete().eq("id", id);
  },

  // Certifications CRUD
  async createCertification(data: Omit<Certification, "id" | "user_id" | "created_at" | "updated_at">) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    return supabase.from("certifications").insert({ ...data, user_id: user.id }).select().single();
  },
  async updateCertification(id: string, data: Partial<Certification>) {
    return supabase.from("certifications").update(data).eq("id", id).select().single();
  },
  async deleteCertification(id: string) {
    return supabase.from("certifications").delete().eq("id", id);
  },

  // Projects CRUD
  async createProject(data: Omit<Project, "id" | "user_id" | "created_at" | "updated_at">) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    return supabase.from("projects").insert({ ...data, user_id: user.id }).select().single();
  },
  async updateProject(id: string, data: Partial<Project>) {
    return supabase.from("projects").update(data).eq("id", id).select().single();
  },
  async deleteProject(id: string) {
    return supabase.from("projects").delete().eq("id", id);
  },

  // Achievements CRUD
  async createAchievement(data: Omit<Achievement, "id" | "user_id" | "created_at" | "updated_at">) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    return supabase.from("achievements").insert({ ...data, user_id: user.id }).select().single();
  },
  async updateAchievement(id: string, data: Partial<Achievement>) {
    return supabase.from("achievements").update(data).eq("id", id).select().single();
  },
  async deleteAchievement(id: string) {
    return supabase.from("achievements").delete().eq("id", id);
  },

  // Skills CRUD
  async createSkill(data: Omit<UserSkill, "id" | "user_id" | "created_at" | "updated_at">) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    return supabase.from("user_skills").insert({ ...data, user_id: user.id }).select().single();
  },
  async updateSkill(id: string, data: Partial<UserSkill>) {
    return supabase.from("user_skills").update(data).eq("id", id).select().single();
  },
  async deleteSkill(id: string) {
    return supabase.from("user_skills").delete().eq("id", id);
  },

  // Events CRUD
  async createEvent(data: Omit<EventActivity, "id" | "user_id" | "created_at" | "updated_at">) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    return supabase.from("events_activities").insert({ ...data, user_id: user.id }).select().single();
  },
  async updateEvent(id: string, data: Partial<EventActivity>) {
    return supabase.from("events_activities").update(data).eq("id", id).select().single();
  },
  async deleteEvent(id: string) {
    return supabase.from("events_activities").delete().eq("id", id);
  },
};
