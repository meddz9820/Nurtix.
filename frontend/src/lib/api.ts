// Shared API client and helpers
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
export const API = `${BASE}/api`;

export type Role = 'patient' | 'doctor';
export interface User {
  id: string;
  name: string;
  role: Role;
  email?: string;
}

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  bio: string;
  avatar: string;
  credentials: string[];
  verified: boolean;
  rating: number;
  reviews_count: number;
  years_experience: number;
  fee: number;
  location: { lat: number; lng: number; area: string };
  online: boolean;
}

export interface Visit {
  id: string;
  patient_id: string;
  patient_name: string;
  address: string;
  symptoms: string;
  urgency: string;
  patient_location: { lat: number; lng: number };
  status: 'pending' | 'accepted' | 'en_route' | 'arrived' | 'completed' | 'cancelled';
  doctor_id?: string;
  doctor_name?: string;
  doctor_avatar?: string;
  eta_minutes?: number;
  fee?: number;
  created_at: string;
  accepted_at?: string;
  completed_at?: string;
}

export interface Review {
  id: string;
  doctor_id: string;
  patient_name: string;
  rating: number;
  comment: string;
  created_at: string;
}

export const storage = {
  async setUser(u: User) {
    await AsyncStorage.setItem('user', JSON.stringify(u));
  },
  async getUser(): Promise<User | null> {
    const s = await AsyncStorage.getItem('user');
    return s ? JSON.parse(s) : null;
  },
  async clear() {
    await AsyncStorage.removeItem('user');
  },
};

export const api = {
  async login(name: string, role: Role) {
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, role }),
    });
    return (await r.json()) as User;
  },
  async listDoctors(onlineOnly = false): Promise<Doctor[]> {
    const r = await fetch(`${API}/doctors${onlineOnly ? '?online_only=true' : ''}`);
    return r.json();
  },
  async getDoctor(id: string): Promise<Doctor> {
    const r = await fetch(`${API}/doctors/${id}`);
    return r.json();
  },
  async getReviews(id: string): Promise<Review[]> {
    const r = await fetch(`${API}/doctors/${id}/reviews`);
    return r.json();
  },
  async toggleOnline(id: string, online: boolean) {
    await fetch(`${API}/doctors/${id}/online?online=${online}`, { method: 'PATCH' });
  },
  async createVisit(payload: any): Promise<Visit> {
    const r = await fetch(`${API}/visits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return r.json();
  },
  async patientVisits(patientId: string): Promise<Visit[]> {
    const r = await fetch(`${API}/visits/patient/${patientId}`);
    return r.json();
  },
  async doctorFeed(): Promise<Visit[]> {
    const r = await fetch(`${API}/visits/doctor/feed`);
    return r.json();
  },
  async doctorActive(doctorId: string): Promise<Visit[]> {
    const r = await fetch(`${API}/visits/doctor/${doctorId}/active`);
    return r.json();
  },
  async getVisit(id: string): Promise<Visit> {
    const r = await fetch(`${API}/visits/${id}`);
    return r.json();
  },
  async acceptVisit(visitId: string, doctorId: string): Promise<Visit> {
    const r = await fetch(`${API}/visits/${visitId}/accept?doctor_id=${doctorId}`, {
      method: 'PATCH',
    });
    return r.json();
  },
  async updateStatus(visitId: string, status: string): Promise<Visit> {
    const r = await fetch(`${API}/visits/${visitId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    return r.json();
  },
  async sendSymptom(sessionId: string, message: string) {
    const r = await fetch(`${API}/symptom-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, message }),
    });
    return r.json();
  },
  async getChatMessages(sessionId: string) {
    const r = await fetch(`${API}/symptom-check/${sessionId}/messages`);
    return r.json();
  },
  async submitReview(payload: any): Promise<Review> {
    const r = await fetch(`${API}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return r.json();
  },
  async createPrescription(payload: any) {
    const r = await fetch(`${API}/prescriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return r.json();
  },
  async getPrescription(visitId: string) {
    const r = await fetch(`${API}/visits/${visitId}/prescription`);
    const txt = await r.text();
    if (!txt || txt === 'null') return null;
    return JSON.parse(txt);
  },
  async getInvoice(visitId: string) {
    const r = await fetch(`${API}/visits/${visitId}/invoice`);
    const txt = await r.text();
    if (!txt || txt === 'null') return null;
    return JSON.parse(txt);
  },
  async getEarnings(doctorId: string) {
    const r = await fetch(`${API}/doctors/${doctorId}/earnings`);
    return r.json();
  },
  async requestWithdrawal(doctorId: string, amount: number) {
    const r = await fetch(`${API}/doctors/${doctorId}/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, method: 'bank_transfer' }),
    });
    return r.json();
  },
  async listWithdrawals(doctorId: string) {
    const r = await fetch(`${API}/doctors/${doctorId}/withdrawals`);
    return r.json();
  },
  async createCheckout(visitId: string, originUrl: string) {
    const r = await fetch(`${API}/payments/checkout/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visit_id: visitId, origin_url: originUrl }),
    });
    return r.json();
  },
  async checkPaymentStatus(sessionId: string) {
    const r = await fetch(`${API}/payments/checkout/status/${sessionId}`);
    return r.json();
  },
  async saveBank(doctorId: string, payload: any) {
    const r = await fetch(`${API}/doctors/${doctorId}/bank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return r.json();
  },
  async getBank(doctorId: string) {
    const r = await fetch(`${API}/doctors/${doctorId}/bank`);
    const txt = await r.text();
    if (!txt || txt === 'null') return null;
    return JSON.parse(txt);
  },
};

export const COLORS = {
  bg: '#F8F7F4',
  card: '#FFFFFF',
  primary: '#123524',
  accent: '#FF4F40',
  surface: '#EAE7E0',
  textPrimary: '#1A1A1A',
  textSecondary: '#5C6159',
  textDisabled: '#A3A7A0',
  success: '#2D7A5C',
  warning: '#F2A900',
  error: '#D32F2F',
};
