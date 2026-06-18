import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, storage, COLORS, Doctor } from '../../src/lib/api';

const ITEM_LABELS: Record<string, string> = {
  paracetamol_500: 'Paracetamol 500mg',
  ibuprofen_400: 'Ibuprofen 400mg',
  amoxicillin_500: 'Amoxicillin 500mg',
  ors_sachets: 'ORS Sachets',
  cetirizine_10: 'Cetirizine 10mg',
  antiseptic_kit: 'Antiseptic Kit',
  thermometer: 'Digital Thermometer',
  bandages: 'Bandage Roll',
};

export default function InventoryScreen() {
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [kit, setKit] = useState<any>(null);
  const [stores, setStores] = useState<any[]>([]);
  const [wastage, setWastage] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanModal, setScanModal] = useState(false);
  const [wasteModal, setWasteModal] = useState(false);
  const [wasteForm, setWasteForm] = useState({ item_id: '', qty: '1', reason: '' });

  const load = useCallback(async () => {
    const u = await storage.getUser();
    if (!u) return;
    const all = await api.listDoctors();
    const me = all.find((d) => d.name.toLowerCase() === u.name.toLowerCase()) || all[0];
    setDoctor(me);
    if (me) {
      const [k, s, w] = await Promise.all([
        api.getKit(me.id),
        api.listDarkStores(),
        api.listWastage(me.id),
      ]);
      setKit(k);
      setStores(s);
      setWastage(w);
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const showAlert = (m: string) => {
    if (Platform.OS === 'web') window.alert(m);
    else Alert.alert('NURTIX', m);
  };

  const scan = async (storeId: string) => {
    if (!doctor) return;
    setScanning(true);
    try {
      const r = await api.checkoutKit(doctor.id, storeId);
      if (r?.dark_store_id) {
        setScanModal(false);
        await load();
        showAlert(`Kit checked out from ${r.dark_store_name}`);
      } else {
        showAlert(r?.detail || 'Checkout failed.');
      }
    } finally {
      setScanning(false);
    }
  };

  const submitWastage = async () => {
    if (!doctor || !wasteForm.item_id || !wasteForm.reason.trim()) {
      showAlert('Select item and reason.');
      return;
    }
    const qty = parseInt(wasteForm.qty, 10) || 1;
    await api.logWastage(doctor.id, {
      item_id: wasteForm.item_id,
      qty,
      reason: wasteForm.reason.trim(),
    });
    setWasteModal(false);
    setWasteForm({ item_id: '', qty: '1', reason: '' });
    await load();
    showAlert('Wastage logged.');
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ paddingTop: 8, paddingBottom: 14 }}>
          <Text style={styles.label}>YOUR MOBILE KIT</Text>
          <Text style={styles.title}>Inventory</Text>
        </View>

        {kit ? (
          <View style={styles.kitCard}>
            <View style={styles.kitHead}>
              <Ionicons name="cube" size={22} color="#FFF" />
              <View style={{ flex: 1 }}>
                <Text style={styles.kitTitle}>{kit.kit_code} · ACTIVE</Text>
                <Text style={styles.kitSub}>From {kit.dark_store_name}</Text>
              </View>
              <TouchableOpacity style={styles.rescanBtn} onPress={() => setScanModal(true)} testID="rescan-button">
                <Ionicons name="qr-code" size={14} color={COLORS.primary} />
                <Text style={styles.rescanText}>Restock</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.kitGrid}>
              {Object.entries(kit.items || {}).map(([id, qty]: any) => (
                <View key={id} style={styles.kitItem} testID={`kit-item-${id}`}>
                  <Text style={styles.kitItemName}>{ITEM_LABELS[id] || id}</Text>
                  <Text style={styles.kitItemQty}>×{qty}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <TouchableOpacity
            testID="qr-scan-button"
            style={styles.scanCta}
            onPress={() => setScanModal(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="qr-code" size={32} color={COLORS.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.scanTitle}>QR Scan Check-Out</Text>
              <Text style={styles.scanSub}>
                Scan the locker QR at any Dark Store to bind a fresh kit to your profile
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
        )}

        <View style={styles.wasteHead}>
          <Text style={styles.sectionTitle}>Wastage Ledger</Text>
          <TouchableOpacity onPress={() => setWasteModal(true)} testID="open-wastage-button">
            <Text style={styles.addLink}>+ Log waste</Text>
          </TouchableOpacity>
        </View>

        {wastage.length === 0 ? (
          <Text style={styles.empty}>No wastage logged yet.</Text>
        ) : (
          wastage.map((w) => (
            <View key={w.id} style={styles.wasteRow} testID={`waste-${w.id}`}>
              <Ionicons name="alert-circle" size={18} color={COLORS.warning} />
              <View style={{ flex: 1 }}>
                <Text style={styles.wasteName}>{w.item_name} × {w.qty}</Text>
                <Text style={styles.wasteReason}>{w.reason}</Text>
              </View>
              <Text style={styles.wasteDate}>{new Date(w.at).toLocaleDateString()}</Text>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={scanModal} transparent animationType="slide" onRequestClose={() => setScanModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>Scan Dark Store QR</Text>
            <Text style={styles.modalSub}>Select a hub to simulate the locker QR scan</Text>
            {stores.map((s) => (
              <TouchableOpacity
                key={s.id}
                style={styles.storeRow}
                onPress={() => scan(s.id)}
                disabled={scanning}
                testID={`store-${s.id}`}
              >
                <View style={styles.storeIcon}>
                  <Ionicons name="storefront" size={18} color={COLORS.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.storeName}>{s.name}</Text>
                  <Text style={styles.storeArea}>{s.area}</Text>
                </View>
                {scanning ? (
                  <ActivityIndicator color={COLORS.primary} />
                ) : (
                  <Ionicons name="qr-code" size={20} color={COLORS.accent} />
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setScanModal(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={wasteModal} transparent animationType="slide" onRequestClose={() => setWasteModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>Flag spoiled / damaged asset</Text>
            <ScrollView style={{ maxHeight: 160 }}>
              {Object.entries(ITEM_LABELS).map(([id, name]) => (
                <TouchableOpacity
                  key={id}
                  style={[styles.itemPick, wasteForm.item_id === id && styles.itemPickSel]}
                  onPress={() => setWasteForm({ ...wasteForm, item_id: id })}
                >
                  <Text style={[styles.itemPickText, wasteForm.item_id === id && { color: COLORS.accent }]}>
                    {name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                value={wasteForm.qty}
                onChangeText={(t) => setWasteForm({ ...wasteForm, qty: t.replace(/[^0-9]/g, '') })}
                placeholder="Qty"
                keyboardType="number-pad"
                style={[styles.input, { width: 80 }]}
                placeholderTextColor={COLORS.textDisabled}
              />
              <TextInput
                value={wasteForm.reason}
                onChangeText={(t) => setWasteForm({ ...wasteForm, reason: t })}
                placeholder="Reason (spoiled, broken, expired)"
                placeholderTextColor={COLORS.textDisabled}
                style={[styles.input, { flex: 1 }]}
              />
            </View>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={[styles.cancelBtn, { flex: 1 }]} onPress={() => setWasteModal(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, { flex: 1 }]} onPress={submitWastage} testID="confirm-wastage">
                <Text style={styles.confirmText}>Log</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingHorizontal: 20 },
  label: { fontSize: 10, letterSpacing: 3, color: COLORS.textSecondary },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.textPrimary },
  scanCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#FFF',
    padding: 18,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.surface,
    marginBottom: 18,
  },
  scanTitle: { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary },
  scanSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  kitCard: {
    backgroundColor: COLORS.primary,
    borderRadius: 24,
    padding: 18,
    marginBottom: 18,
  },
  kitHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  kitTitle: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  kitSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },
  rescanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  rescanText: { color: COLORS.primary, fontWeight: '700', fontSize: 12 },
  kitGrid: { gap: 6 },
  kitItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  kitItemName: { color: '#FFF', fontSize: 14 },
  kitItemQty: { color: COLORS.accent, fontWeight: '800' },
  wasteHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary },
  addLink: { color: COLORS.accent, fontWeight: '700' },
  empty: { color: COLORS.textSecondary, fontSize: 13, padding: 16 },
  wasteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFF',
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.surface,
  },
  wasteName: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  wasteReason: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  wasteDate: { fontSize: 11, color: COLORS.textSecondary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(18,53,36,0.45)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#FFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 32 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.surface, alignSelf: 'center', marginBottom: 18 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary },
  modalSub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4, marginBottom: 16 },
  storeRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    backgroundColor: COLORS.bg,
    padding: 14,
    borderRadius: 16,
    marginBottom: 8,
  },
  storeIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  storeName: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  storeArea: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  cancelBtn: { backgroundColor: COLORS.surface, paddingVertical: 14, borderRadius: 999, alignItems: 'center', marginTop: 10 },
  cancelText: { color: COLORS.primary, fontWeight: '700' },
  confirmBtn: { backgroundColor: COLORS.accent, paddingVertical: 14, borderRadius: 999, alignItems: 'center' },
  confirmText: { color: '#FFF', fontWeight: '700' },
  itemPick: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: COLORS.bg,
    marginBottom: 6,
  },
  itemPickSel: { backgroundColor: '#FFF5F2', borderWidth: 1, borderColor: COLORS.accent },
  itemPickText: { color: COLORS.textPrimary, fontSize: 14 },
  input: {
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.surface,
    marginTop: 12,
  },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
});
