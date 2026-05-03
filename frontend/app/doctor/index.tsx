import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, storage, COLORS, Doctor, Visit } from '../../src/lib/api';

const URGENCY_COLOR: Record<string, string> = {
  routine: COLORS.success,
  urgent: COLORS.warning,
  asap: COLORS.accent,
};

export default function DoctorFeed() {
  const router = useRouter();
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [feed, setFeed] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);

  const load = useCallback(async () => {
    const u = await storage.getUser();
    if (!u) {
      router.replace('/');
      return;
    }
    const all = await api.listDoctors();
    const me =
      all.find((d) => d.name.toLowerCase() === u.name.toLowerCase()) ||
      all[0]; // fallback to first doctor for demo
    setDoctor(me);
    const f = await api.doctorFeed();
    setFeed(f);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const toggle = async (val: boolean) => {
    if (!doctor) return;
    setDoctor({ ...doctor, online: val });
    await api.toggleOnline(doctor.id, val);
  };

  const accept = async (visit: Visit) => {
    if (!doctor) return;
    setAccepting(visit.id);
    try {
      await api.acceptVisit(visit.id, doctor.id);
      router.push('/doctor/active');
    } finally {
      setAccepting(null);
    }
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
        contentContainerStyle={{ paddingBottom: 30 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.label}>WELCOME BACK</Text>
            <Text style={styles.greet}>{doctor?.name}</Text>
          </View>
          <TouchableOpacity onPress={logout} style={styles.logoutBtn} testID="logout-button">
            <Ionicons name="log-out-outline" size={20} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.statusCard} testID="online-toggle-card">
          <View style={{ flex: 1 }}>
            <Text style={styles.statusLabel}>YOU ARE</Text>
            <Text style={styles.statusValue}>
              {doctor?.online ? 'ONLINE · ACCEPTING' : 'OFFLINE'}
            </Text>
            <Text style={styles.statusSub}>
              {doctor?.online
                ? 'You will receive visit requests near you.'
                : 'Tap to start receiving requests.'}
            </Text>
          </View>
          <Switch
            value={doctor?.online}
            onValueChange={toggle}
            trackColor={{ false: COLORS.surface, true: COLORS.success }}
            thumbColor="#FFF"
            testID="online-switch"
          />
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{doctor?.rating}</Text>
            <Text style={styles.statLabel}>RATING</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{doctor?.reviews_count}</Text>
            <Text style={styles.statLabel}>REVIEWS</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>₹{doctor?.fee}</Text>
            <Text style={styles.statLabel}>PER VISIT</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Nearby requests</Text>
          <Text style={styles.sectionSub}>{feed.length} pending</Text>
        </View>

        {feed.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="checkmark-circle" size={40} color={COLORS.success} />
            <Text style={styles.emptyText}>All clear</Text>
            <Text style={styles.emptySub}>No pending requests right now.</Text>
          </View>
        ) : (
          feed.map((v) => (
            <View key={v.id} style={styles.jobCard} testID={`job-card-${v.id}`}>
              <View style={styles.jobHead}>
                <View
                  style={[
                    styles.urgPill,
                    { backgroundColor: URGENCY_COLOR[v.urgency] || COLORS.warning },
                  ]}
                >
                  <Text style={styles.urgText}>{v.urgency.toUpperCase()}</Text>
                </View>
                <Text style={styles.jobTime}>
                  {new Date(v.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
              <Text style={styles.jobPatient}>{v.patient_name}</Text>
              <Text style={styles.jobSymptoms}>{v.symptoms}</Text>
              {v.symptom_summary && (
                <View style={styles.aiPanel} testID={`ai-summary-${v.id}`}>
                  <View style={styles.aiHead}>
                    <Ionicons name="sparkles" size={12} color={COLORS.accent} />
                    <Text style={styles.aiHeadText}>AI TRIAGE REPORT</Text>
                  </View>
                  <Text style={styles.aiSummary} numberOfLines={3}>
                    {v.symptom_summary.patient_summary}
                  </Text>
                  {(v.symptom_summary.suggested_initial_medications || []).length > 0 && (
                    <Text style={styles.aiMeds}>
                      Suggested OTC:{' '}
                      {(v.symptom_summary.suggested_initial_medications || [])
                        .map((m: any) => m.name)
                        .slice(0, 3)
                        .join(', ')}
                    </Text>
                  )}
                </View>
              )}
              <View style={styles.jobMeta}>
                <Ionicons name="location" size={12} color={COLORS.textSecondary} />
                <Text style={styles.jobAddr}>{v.address}</Text>
              </View>
              <TouchableOpacity
                testID={`doctor-accept-job-button-${v.id}`}
                style={[styles.acceptBtn, accepting === v.id && { opacity: 0.6 }]}
                onPress={() => accept(v)}
                disabled={accepting === v.id}
              >
                {accepting === v.id ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <Text style={styles.acceptText}>Accept · ETA 18 min</Text>
                    <Ionicons name="arrow-forward" size={16} color="#FFF" />
                  </>
                )}
              </TouchableOpacity>
            </View>
          ))
        )}
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
  greet: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary, marginTop: 2 },
  logoutBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusCard: {
    backgroundColor: COLORS.primary,
    borderRadius: 24,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  statusLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 10, letterSpacing: 2 },
  statusValue: { color: '#FFF', fontSize: 18, fontWeight: '800', marginTop: 4 },
  statusSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  statCard: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.surface,
  },
  statValue: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary },
  statLabel: { fontSize: 10, letterSpacing: 2, color: COLORS.textSecondary, marginTop: 4 },
  section: { marginBottom: 12 },
  sectionTitle: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary },
  sectionSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 40, gap: 6 },
  emptyText: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, marginTop: 10 },
  emptySub: { fontSize: 13, color: COLORS.textSecondary },
  jobCard: {
    backgroundColor: '#FFF',
    borderRadius: 22,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.surface,
  },
  jobHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  urgPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  urgText: { color: '#FFF', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  jobTime: { fontSize: 12, color: COLORS.textSecondary },
  jobPatient: { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary },
  jobSymptoms: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4, marginBottom: 8 },
  aiPanel: {
    backgroundColor: COLORS.bg,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
  },
  aiHead: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  aiHeadText: { color: COLORS.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  aiSummary: { fontSize: 12, color: COLORS.textPrimary, lineHeight: 17 },
  aiMeds: {
    fontSize: 11,
    color: COLORS.primary,
    marginTop: 6,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  jobMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  jobAddr: { fontSize: 12, color: COLORS.textSecondary, flex: 1 },
  acceptBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 999,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  acceptText: { color: '#FFF', fontWeight: '700' },
});
