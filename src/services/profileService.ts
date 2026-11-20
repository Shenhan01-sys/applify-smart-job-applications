import { supabase } from "@/lib/supabase";
import { mockFullProfile } from "@/mocks/mockData";
import type { ExperienceRow, EducationRow, SkillRow } from "@/lib/profileForms";
import { postLoginTarget, type PostLoginTarget, type ProfileSummary } from "@/lib/onboarding";

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
  // Kolom di bawah ini boleh NULL di database (schema.sql: achievements), jadi null sah, bukan hanya undefined.
  description?: string | null;
  category?: string | null;
  issuer?: string | null;
  achievement_date?: string | null;
  url?: string | null;
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
  /**
   * Ringkasan isi profil (nama, jabatan, jumlah skill, pengalaman, pendidikan) untuk onboarding dan penjaga
   * AI Apply. Galat dilempar: ringkasan yang gagal dibaca tidak boleh terlihat seperti profil kosong.
   */
  async getSummary(userId: string): Promise<ProfileSummary> {
    if (isMockMode()) {
      const m = mockFullProfile;
      return {
        full_name: m.profile.full_name ?? "",
        current_title: m.profile.current_title ?? "",
        skills: m.skills.length,
        experiences: m.workExperiences.length,
        education: m.education.length,
      };
    }
    const count = (table: string) => supabase.from(table).select("id", { count: "exact", head: true }).eq("user_id", userId);
    const [profile, skills, experiences, education] = await Promise.all([
      supabase.from("profiles").select("full_name, current_title").eq("id", userId).maybeSingle(),
      count("user_skills"),
      count("work_experiences"),
      count("education"),
    ]);
    const failed = [profile, skills, experiences, education].find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);
    return {
      full_name: profile.data?.full_name ?? "",
      current_title: profile.data?.current_title ?? "",
      skills: skills.count ?? 0,
      experiences: experiences.count ?? 0,
      education: education.count ?? 0,
    };
  },

  /** Ke mana pengguna dikirim setelah daftar atau masuk. Gagal membaca profil berarti dashboard, bukan terkunci. */
  async resolvePostLoginTarget(userId: string): Promise<PostLoginTarget> {
    try {
      return postLoginTarget(await this.getSummary(userId));
    } catch (err) {
      console.warn("[onboarding] ringkasan profil tidak terbaca, lanjut ke dashboard:", err);
      return postLoginTarget(null);
    }
  },

  // Fetch full profile
  async getFullProfile(userId: string): Promise<FullProfile> {
    if (isMockMode()) {
      return mockFullProfile as unknown as FullProfile;
    }

    const results = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("work_experiences").select("*").eq("user_id", userId).order("start_date", { ascending: false }),
      supabase.from("education").select("*").eq("user_id", userId).order("start_year", { ascending: false }),
      supabase.from("certifications").select("*").eq("user_id", userId).order("issue_date", { ascending: false }),
      supabase.from("projects").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("achievements").select("*").eq("user_id", userId).order("achievement_date", { ascending: false }),
      supabase.from("user_skills").select("*").eq("user_id", userId).order("proficiency_level", { ascending: false }),
      supabase.from("events_activities").select("*").eq("user_id", userId).order("start_date", { ascending: false }),
    ]);

    // A failed query must not look like an empty profile: the page would then offer to "add" data that
    // already exists. Surface the first error instead.
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);

    const [profile, workExperiences, education, certifications, projects, achievements, skills, events] = results.map((r) => r.data) as any[];

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

  // Skills for the match score on the job list: user_skills names and work_experiences.skills_used.
  // A failed query throws, so "no skills" is never shown for a profile that could not be read.
  async getSkillSource(userId: string): Promise<{ skills: Array<{ name: string }>; experiences: Array<{ skills_used: unknown }> }> {
    if (isMockMode()) {
      return {
        skills: (mockFullProfile as any).skills ?? [],
        experiences: (mockFullProfile as any).workExperiences ?? [],
      };
    }
    const [s, e] = await Promise.all([
      supabase.from("user_skills").select("name").eq("user_id", userId),
      supabase.from("work_experiences").select("skills_used").eq("user_id", userId),
    ]);
    if (s.error) throw new Error(s.error.message);
    if (e.error) throw new Error(e.error.message);
    return { skills: s.data ?? [], experiences: e.data ?? [] };
  },

  // Work Experiences CRUD
  async createWorkExperience(data: ExperienceRow) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    return supabase.from("work_experiences").insert({ ...data, user_id: user.id }).select().single();
  },
  async updateWorkExperience(id: string, data: Partial<ExperienceRow>) {
    return supabase.from("work_experiences").update(data).eq("id", id).select().single();
  },
  async deleteWorkExperience(id: string) {
    return supabase.from("work_experiences").delete().eq("id", id);
  },

  // Education CRUD
  async createEducation(data: EducationRow) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    return supabase.from("education").insert({ ...data, user_id: user.id }).select().single();
  },
  async updateEducation(id: string, data: Partial<EducationRow>) {
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
  async createSkill(data: SkillRow) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    return supabase.from("user_skills").insert({ ...data, user_id: user.id }).select().single();
  },
  async updateSkill(id: string, data: Partial<SkillRow>) {
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
