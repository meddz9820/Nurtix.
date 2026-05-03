import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, storage, COLORS, User, Doctor, Visit } from '../../src/lib/api';

export default function PatientHome() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [activeVisit, setActiveVisit] = useState<Visit | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const u = await storage.getUser();
    if (!u) {
      router.replace('/');
      return;
    }
    setUser(u);
    const [docs, visits] = await Promise.all([
      api.listDoctors(true),
      api.patientVisits(u.id),
    ]);
    setDoctors(docs);
    const active = visits.find((v) =>
      ['pending', 'accepted', 'en_route', 'arrived'].includes(v.status),
    );
    setActiveVisit(active || null);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const requestVisit = async () => {
    if (!user) return;
    const visit = await api.createVisit({
      patient_id: user.id,
      patient_name: user.name,
      address: '12, Linden Avenue, Indiranagar',
      symptoms: 'Fever, body ache, headache',
      urgency: 'urgent',
      patient_location: { lat: 12.9716, lng: 77.5946 },
    });
    router.push(`/tracking/${visit.id}`);
  };

  const logout = async () => {
    await storage.clear();
    router.replace('/');
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center' }]}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.label}>HELLO</Text>
            <Text style={styles.greet}>{user?.name}</Text>
          </View>
          <TouchableOpacity onPress={logout} testID="logout-button" style={styles.logoutBtn}>
            <Ionicons name="log-out-outline" size={20} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {activeVisit ? (
          <TouchableOpacity
            testID="active-visit-card"
            style={styles.activeCard}
            onPress={() => router.push(`/tracking/${activeVisit.id}`)}
            activeOpacity={0.9}
          >
            <View style={styles.dotPulse} />
            <View style={{ flex: 1 }}>
              <Text style={styles.activeLabel}>ACTIVE VISIT · {activeVisit.status.toUpperCase()}</Text>
              <Text style={styles.activeTitle}>
                {activeVisit.doctor_name || 'Finding doctor near you...'}
              </Text>
              {activeVisit.eta_minutes && (
                <Text style={styles.activeEta}>ETA · {activeVisit.eta_minutes} min</Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={22} color="#FFF" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            testID="patient-booking-button"
            style={styles.heroCard}
            onPress={requestVisit}
            activeOpacity={0.9}
          >
            <Text style={styles.heroLabel}>ONE-TAP BOOKING</Text>
            <Text style={styles.heroTitle}>Book a doctor{'\n'}home visit</Text>
            <View style={styles.heroFooter}>
              <Text style={styles.heroSub}>Avg arrival · 22 min</Text>
              <View style={styles.heroBtn}>
                <Text style={styles.heroBtnText}>Request now</Text>
                <Ionicons name="arrow-forward" size={16} color="#FFF" />
              </View>
            </View>
          </TouchableOpacity>
        )}

        <View style={styles.quickRow}>
          <TouchableOpacity
            testID="symptom-checker-card"
            style={styles.quickCard}
            onPress={() => router.push('/patient/symptom')}
          >
            <Ionicons name="sparkles" size={24} color={COLORS.accent} />
            <Text style={styles.quickTitle}>AI Symptom{'\n'}Checker</Text>
            <Text style={styles.quickSub}>Talk first</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push('/patient/visits')}
            testID="visits-history-card"
          >
            <Ionicons name="time-outline" size={24} color={COLORS.primary} />
            <Text style={styles.quickTitle}>Past{'\n'}Visits</Text>
            <Text style={styles.quickSub}>Your history</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Doctors near you</Text>
          <Text style={styles.sectionSub}>Verified · Online now</Text>
        </View>

        {doctors.map((doc) => (
          <TouchableOpacity
            key={doc.id}
            testID={`doctor-card-${doc.id}`}
            style={styles.docCard}
            onPress={() => router.push(`/doctor-profile/${doc.id}`)}
            activeOpacity={0.85}
          >
            <Image source={{ uri: doc.avatar }} style={styles.avatar} />
            <View style={{ flex: 1 }}>
              <View style={styles.docHeader}>
                <Text style={styles.docName}>{doc.name}</Text>
                {doc.verified && (
                  <Ionicons name="shield-checkmark" size={16} color={COLORS.success} />
                )}
              </View>
              <Text style={styles.docSpec}>{doc.specialty}</Text>
              <View style={styles.docMeta}>
                <Ionicons name="star" size={12} color={COLORS.warning} />
                <Text style={styles.docMetaText}>
                  {doc.rating} · {doc.reviews_count} reviews · ₹{doc.fee}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textDisabled} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingHorizontal: 20 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 18,
  },
  label: { fontSize: 11, letterSpacing: 3, color: COLORS.textSecondary },
  greet: { fontSize: 24, fontWeight: '800', color: COLORS.textPrimary, marginTop: 2 },
  logoutBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCard: {
    backgroundColor: COLORS.primary,
    borderRadius: 28,
    padding: 24,
    marginBottom: 14,
  },
  heroLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, letterSpacing: 3 },
  heroTitle: {
    color: '#FFF',
    fontSize: 32,
    fontWeight: '800',
    marginTop: 10,
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  heroFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
  },
  heroSub: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  heroBtn: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroBtnText: { color: '#FFF', fontWeight: '700' },
  activeCard: {
    backgroundColor: COLORS.primary,
    borderRadius: 24,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 14,
  },
  dotPulse: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.accent,
  },
  activeLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 10, letterSpacing: 2 },
  activeTitle: { color: '#FFF', fontSize: 17, fontWeight: '700', marginTop: 4 },
  activeEta: { color: COLORS.accent, fontSize: 13, fontWeight: '700', marginTop: 2 },
  quickRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  quickCard: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 22,
    padding: 18,
    minHeight: 110,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: COLORS.surface,
  },
  quickTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary, marginTop: 12 },
  quickSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary },
  sectionSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  docCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 14,
    alignItems: 'center',
    gap: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.surface,
  },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.surface },
  docHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  docName: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  docSpec: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  docMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  docMetaText: { fontSize: 12, color: COLORS.textSecondary },
});
