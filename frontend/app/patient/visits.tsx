import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, storage, COLORS, Visit } from '../../src/lib/api';

const STATUS_COLOR: Record<string, string> = {
  pending: COLORS.warning,
  accepted: COLORS.primary,
  en_route: COLORS.primary,
  arrived: COLORS.success,
  completed: COLORS.success,
  cancelled: COLORS.error,
};

export default function VisitsHistory() {
  const router = useRouter();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const u = await storage.getUser();
    if (!u) return;
    const v = await api.patientVisits(u.id);
    setVisits(v);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={{ paddingTop: 8, paddingBottom: 14 }}>
        <Text style={styles.label}>YOUR HISTORY</Text>
        <Text style={styles.title}>Visits</Text>
      </View>
      <ScrollView
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
        contentContainerStyle={{ paddingBottom: 30 }}
      >
        {visits.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="time-outline" size={40} color={COLORS.textDisabled} />
            <Text style={styles.emptyText}>No visits yet</Text>
            <Text style={styles.emptySub}>
              Book your first home doctor visit from the Home tab.
            </Text>
          </View>
        ) : (
          visits.map((v) => (
            <TouchableOpacity
              key={v.id}
              style={styles.card}
              onPress={() => router.push(`/tracking/${v.id}`)}
              testID={`visit-${v.id}`}
            >
              <View style={styles.cardTop}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: STATUS_COLOR[v.status] || COLORS.textDisabled },
                  ]}
                />
                <Text style={styles.statusText}>{v.status.toUpperCase()}</Text>
                <Text style={styles.date}>
                  {new Date(v.created_at).toLocaleDateString()}
                </Text>
              </View>
              <Text style={styles.docName}>
                {v.doctor_name || 'Awaiting doctor assignment'}
              </Text>
              <Text style={styles.symptoms}>{v.symptoms}</Text>
              <View style={styles.cardFooter}>
                <Text style={styles.address}>
                  <Ionicons name="location" size={11} color={COLORS.textSecondary} />{' '}
                  {v.address}
                </Text>
                {v.fee && <Text style={styles.fee}>₹{v.fee}</Text>}
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingHorizontal: 20 },
  label: { fontSize: 10, letterSpacing: 3, color: COLORS.textSecondary },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.textPrimary },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, marginTop: 12 },
  emptySub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 30,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.surface,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: '700', color: COLORS.textPrimary, letterSpacing: 1 },
  date: { fontSize: 12, color: COLORS.textSecondary, marginLeft: 'auto' },
  docName: { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 4 },
  symptoms: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 10 },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  address: { fontSize: 12, color: COLORS.textSecondary, flex: 1 },
  fee: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
});
