import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, storage, COLORS, Visit } from '../../src/lib/api';

const MAP_BG =
  'https://static.prod-images.emergentagent.com/jobs/f08a18ff-24d5-457c-8a3e-02c34daf0994/images/1050a85ecab9bf64a1b82e04b9bbb1eca3ee6088d2696491af833faae2b97f61.png';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Finding nearest doctor...',
  accepted: 'Doctor confirmed · preparing',
  en_route: 'Doctor is on the way',
  arrived: 'Doctor has arrived',
  completed: 'Visit completed',
  cancelled: 'Visit cancelled',
};

export default function LiveTracking() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [loading, setLoading] = useState(true);
  const [eta, setEta] = useState<number | null>(null);
  const [review, setReview] = useState<any>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const v = await api.getVisit(id);
    setVisit(v);
    setEta(v.eta_minutes ?? null);
    if (v.status === 'completed') {
      const r = await api.getVisitReview(v.id);
      setReview(r);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000); // poll status
    return () => clearInterval(t);
  }, [load]);

  // Decrease ETA simulation while en_route
  useEffect(() => {
    if (visit?.status === 'en_route' && eta && eta > 1) {
      const t = setTimeout(() => setEta((e) => (e ? e - 1 : e)), 30000);
      return () => clearTimeout(t);
    }
  }, [visit?.status, eta]);

  if (loading || !visit) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ImageBackground source={{ uri: MAP_BG }} style={styles.mapBg} resizeMode="cover">
        <SafeAreaView edges={['top']} style={{ paddingHorizontal: 16 }}>
          <View style={styles.topRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="back-button">
              <Ionicons name="chevron-back" size={22} color={COLORS.primary} />
            </TouchableOpacity>
            <View style={styles.statusPill}>
              <View style={styles.dot} />
              <Text style={styles.statusPillText}>LIVE TRACKING</Text>
            </View>
          </View>
        </SafeAreaView>

        {/* Mock map markers */}
        <View style={[styles.marker, { top: '30%', left: '25%' }]}>
          <View style={styles.markerDoctor}>
            <Ionicons name="medkit" size={14} color="#FFF" />
          </View>
          <Text style={styles.markerLabel}>Doctor</Text>
        </View>
        <View style={[styles.marker, { bottom: '32%', right: '25%' }]}>
          <View style={styles.markerHome}>
            <Ionicons name="home" size={14} color={COLORS.primary} />
          </View>
          <Text style={[styles.markerLabel, { color: COLORS.primary }]}>You</Text>
        </View>
      </ImageBackground>

      <SafeAreaView edges={['bottom']} style={styles.sheet} testID="tracking-bottom-sheet">
        <View style={styles.handle} />
        <Text style={styles.statusText}>{STATUS_LABEL[visit.status]}</Text>

        {visit.doctor_name ? (
          <View style={styles.docRow}>
            <Image source={{ uri: visit.doctor_avatar! }} style={styles.docAvatar} />
            <View style={{ flex: 1 }}>
              <Text style={styles.docName}>{visit.doctor_name}</Text>
              <Text style={styles.docSub}>Verified · ₹{visit.fee}</Text>
            </View>
            {eta != null && visit.status !== 'completed' && (
              <View style={styles.etaBox}>
                <Text style={styles.etaNum}>{eta}</Text>
                <Text style={styles.etaUnit}>MIN</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.searchingBox}>
            <ActivityIndicator color={COLORS.accent} />
            <Text style={styles.searchingText}>Connecting with nearest verified doctor...</Text>
          </View>
        )}

        <View style={styles.timeline}>
          {['accepted', 'en_route', 'arrived', 'completed'].map((s, idx) => {
            const order = ['pending', 'accepted', 'en_route', 'arrived', 'completed'];
            const currentIdx = order.indexOf(visit.status);
            const stepIdx = order.indexOf(s);
            const done = currentIdx >= stepIdx;
            return (
              <View key={s} style={styles.tlRow}>
                <View
                  style={[
                    styles.tlDot,
                    done && { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
                  ]}
                />
                <Text style={[styles.tlText, done && { color: COLORS.textPrimary, fontWeight: '700' }]}>
                  {STATUS_LABEL[s]}
                </Text>
              </View>
            );
          })}
        </View>

        {visit.doctor_id && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => router.push(`/doctor-profile/${visit.doctor_id}`)}
              testID="view-doctor-profile"
            >
              <Ionicons name="person-circle-outline" size={18} color={COLORS.primary} />
              <Text style={styles.actionText}>Doctor</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => router.push(`/prescription/${visit.id}`)}
              testID="view-prescription"
            >
              <Ionicons name="document-text-outline" size={18} color={COLORS.primary} />
              <Text style={styles.actionText}>Rx</Text>
            </TouchableOpacity>
            {visit.status === 'completed' && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => router.push(`/invoice/${visit.id}`)}
                testID="view-invoice"
              >
                <Ionicons name="receipt-outline" size={18} color={COLORS.primary} />
                <Text style={styles.actionText}>Invoice</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {visit.status === 'completed' && visit.doctor_id && (
          <View style={styles.reviewCard} testID="review-section">
            {review ? (
              <>
                <Text style={styles.reviewThanks}>✓ Thanks for your review</Text>
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Ionicons
                      key={n}
                      name="star"
                      size={18}
                      color={n <= review.rating ? COLORS.warning : COLORS.surface}
                    />
                  ))}
                </View>
                <Text style={styles.reviewComment}>{review.comment}</Text>
              </>
            ) : (
              <>
                <Text style={styles.reviewTitle}>Rate your visit</Text>
                <Text style={styles.reviewSub}>How was Dr. {(visit.doctor_name || '').split(' ').slice(1).join(' ')}?</Text>
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <TouchableOpacity
                      key={n}
                      onPress={() => setRating(n)}
                      testID={`star-${n}`}
                    >
                      <Ionicons
                        name="star"
                        size={34}
                        color={n <= rating ? COLORS.warning : COLORS.surface}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  testID="review-comment-input"
                  value={comment}
                  onChangeText={setComment}
                  placeholder="Share your experience (optional)"
                  placeholderTextColor={COLORS.textDisabled}
                  multiline
                  style={styles.reviewInput}
                />
                <TouchableOpacity
                  testID="submit-review"
                  style={[styles.reviewBtn, (rating === 0 || submitting) && { opacity: 0.5 }]}
                  disabled={rating === 0 || submitting}
                  onPress={async () => {
                    if (rating === 0 || !visit.doctor_id) return;
                    const u = await storage.getUser();
                    setSubmitting(true);
                    try {
                      const r = await api.submitReview({
                        doctor_id: visit.doctor_id,
                        visit_id: visit.id,
                        patient_name: u?.name || visit.patient_name,
                        rating,
                        comment: comment.trim() || 'Great visit!',
                      });
                      setReview(r);
                      const msg = 'Thanks for your feedback!';
                      if (Platform.OS === 'web') window.alert(msg);
                      else Alert.alert('NURTIX', msg);
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="send" size={16} color="#FFF" />
                      <Text style={styles.reviewBtnText}>Submit review</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  mapBg: { flex: 1, backgroundColor: '#E8DDC9' },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.accent },
  statusPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: COLORS.primary },
  marker: { position: 'absolute', alignItems: 'center' },
  markerDoctor: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFF',
  },
  markerHome: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: COLORS.primary,
  },
  markerLabel: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 4,
    letterSpacing: 1,
  },
  sheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.surface,
    alignSelf: 'center',
    marginBottom: 12,
  },
  statusText: { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    marginBottom: 8,
  },
  docAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.surface,
  },
  docName: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  docSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  etaBox: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    alignItems: 'center',
  },
  etaNum: { color: '#FFF', fontSize: 22, fontWeight: '800' },
  etaUnit: { color: '#FFF', fontSize: 9, letterSpacing: 1, marginTop: -2 },
  searchingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    marginBottom: 10,
  },
  searchingText: { color: COLORS.textSecondary, fontSize: 13, flex: 1 },
  timeline: { marginTop: 12, gap: 8 },
  tlRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tlDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.surface,
    backgroundColor: '#FFF',
  },
  tlText: { fontSize: 13, color: COLORS.textSecondary },
  viewBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    backgroundColor: COLORS.surface,
    borderRadius: 999,
    marginTop: 14,
  },
  viewBtnText: { color: COLORS.primary, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 999,
  },
  actionText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },
  reviewCard: {
    marginTop: 14,
    backgroundColor: COLORS.bg,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.surface,
  },
  reviewTitle: { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary },
  reviewSub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2, marginBottom: 10 },
  reviewThanks: { fontSize: 15, fontWeight: '800', color: COLORS.success, marginBottom: 8 },
  reviewComment: { fontSize: 13, color: COLORS.textSecondary, marginTop: 6, lineHeight: 20 },
  starsRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  reviewInput: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.surface,
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: 10,
  },
  reviewBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.accent,
    borderRadius: 999,
    paddingVertical: 13,
  },
  reviewBtnText: { color: '#FFF', fontWeight: '700' },
});
