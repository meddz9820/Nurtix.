import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, COLORS, Doctor, Review } from '../../src/lib/api';

export default function DoctorTrustProfile() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    const [d, r] = await Promise.all([api.getDoctor(id), api.getReviews(id)]);
    setDoctor(d);
    setReviews(r);
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading || !doctor) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="back-button">
            <Ionicons name="chevron-back" size={22} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.header}>
          <Image source={{ uri: doctor.avatar }} style={styles.avatar} />
          <View style={styles.verifyRow}>
            <Ionicons name="shield-checkmark" size={14} color={COLORS.success} />
            <Text style={styles.verifyText}>VERIFIED · BACKGROUND CHECKED</Text>
          </View>
          <Text style={styles.name}>{doctor.name}</Text>
          <Text style={styles.spec}>
            {doctor.specialty} · {doctor.years_experience} yrs · {doctor.location.area}
          </Text>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{doctor.rating}</Text>
              <Text style={styles.statLabel}>★ RATING</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{doctor.reviews_count}</Text>
              <Text style={styles.statLabel}>REVIEWS</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>₹{doctor.fee}</Text>
              <Text style={styles.statLabel}>FEE</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.bio}>{doctor.bio}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Credentials</Text>
          {doctor.credentials.map((c, i) => (
            <View key={i} style={styles.credRow}>
              <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
              <Text style={styles.credText}>{c}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Patient reviews</Text>
          {reviews.length === 0 ? (
            <Text style={styles.bio}>No reviews yet.</Text>
          ) : (
            reviews.map((r) => (
              <View key={r.id} style={styles.reviewCard}>
                <View style={styles.reviewHead}>
                  <Text style={styles.reviewerName}>{r.patient_name}</Text>
                  <Text style={styles.reviewStars}>{'★'.repeat(r.rating)}</Text>
                </View>
                <Text style={styles.reviewText}>{r.comment}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingHorizontal: 20 },
  topBar: { paddingTop: 8, paddingBottom: 4 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: { alignItems: 'center', paddingTop: 8, paddingBottom: 22 },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: '#FFF',
    backgroundColor: COLORS.surface,
  },
  verifyRow: { flexDirection: 'row', gap: 4, alignItems: 'center', marginTop: 14 },
  verifyText: { fontSize: 10, letterSpacing: 2, color: COLORS.success, fontWeight: '700' },
  name: { fontSize: 26, fontWeight: '800', color: COLORS.textPrimary, marginTop: 6 },
  spec: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4, textAlign: 'center' },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 18, alignSelf: 'stretch' },
  stat: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.surface,
  },
  statValue: { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary },
  statLabel: { fontSize: 10, letterSpacing: 1.5, color: COLORS.textSecondary, marginTop: 4 },
  section: { marginBottom: 22 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 10 },
  bio: { fontSize: 14, color: COLORS.textPrimary, lineHeight: 22 },
  credRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 },
  credText: { fontSize: 14, color: COLORS.textPrimary },
  reviewCard: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.surface,
  },
  reviewHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  reviewerName: { fontWeight: '700', color: COLORS.textPrimary },
  reviewStars: { color: COLORS.warning, fontSize: 13 },
  reviewText: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 20 },
});
