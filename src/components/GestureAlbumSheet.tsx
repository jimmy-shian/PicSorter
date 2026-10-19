import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, Alert, FlatList, KeyboardAvoidingView, Modal, Platform,
  Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { getPref, setPref } from '@/lib/db';
import { getAlbumEntries } from '@/lib/album-order';
import { saveGestureAlbumSettings } from '@/lib/gesture-album-storage';
import { createTargetAlbum, listTargetAlbums } from '@/lib/media';
import { normalizeGestureDraft, toggleShortcut, type GestureAlbumDraft } from '@/lib/gesture-albums';
import { useTheme } from '@/lib/theme';
import { AlbumManagerList } from './AlbumManagerList';

interface Props {
  visible: boolean;
  sourceId: string | null;
  anchor: 'up' | 'down';
  upId: string | null;
  downId: string | null;
  shortcutIds: string[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

export function GestureAlbumSheet(props: Props) {
  const { bg, card, text, muted, border } = useTheme();
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const [draft, setDraft] = useState<GestureAlbumDraft | null>(null);
  const baseline = useRef('');
  const propsRef = useRef(props);
  useLayoutEffect(() => { propsRef.current = props; });
  const [page, setPage] = useState<'select' | 'manage' | 'create'>('select');
  const [anchor, setAnchor] = useState(props.anchor);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [name, setName] = useState('');
  const [retry, setRetry] = useState(0);
  const list = useRef<FlatList>(null);
  const notify = (message: string) => { setNotice(message); AccessibilityInfo.announceForAccessibility(message); };

  useEffect(() => {
    if (!props.visible) return;
    let active = true;
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      setLoading(true); setLoadError(''); setNotice(''); setDraft(null); setPage('select'); setName('');
      setAnchor(propsRef.current.anchor);
      try {
        const live = await listTargetAlbums(props.sourceId);
        const { visible, hidden } = await getAlbumEntries(db, live);
        const next = normalizeGestureDraft({ entries: [...visible, ...hidden].sort((a, b) => a.sortIndex - b.sortIndex),
          upId: propsRef.current.upId, downId: propsRef.current.downId, shortcutIds: propsRef.current.shortcutIds });
        if (!active) return;
        baseline.current = JSON.stringify(next); setDraft(next);
      } catch { if (active) setLoadError('無法載入相簿，請確認相簿存取權限後重試。'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [db, props.sourceId, props.visible, retry]);

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!props.visible || page !== 'manage') return;
    let active = true;
    void (async () => {
      if (await getPref(db, 'has_seen_album_drag_hint', 'false') === 'true' || !active) return;
      setNotice('長按把手拖曳可調整順序');
      await setPref(db, 'has_seen_album_drag_hint', 'true');
    })().catch(() => {});
    return () => { active = false; };
  }, [db, page, props.visible]);

  const requestClose = () => {
    if (saveLock.current) return;
    if (page !== 'select') { setPage('select'); setNotice(''); return; }
    if (draft && JSON.stringify(draft) !== baseline.current) {
      Alert.alert('放棄變更？', '尚未儲存的手勢與相簿設定將會還原。已建立的相簿會保留。', [
        { text: '取消', style: 'cancel' }, { text: '放棄', style: 'destructive', onPress: props.onClose },
      ]);
    } else props.onClose();
  };

  const save = async (returnToSelection = false) => {
    if (!draft || saveLock.current) return;
    saveLock.current = true; setSaving(true); setNotice('');
    let committed = false;
    try {
      const live = await listTargetAlbums(props.sourceId);
      const liveIds = new Set(live.map((e) => e.id));
      const next = normalizeGestureDraft({ ...draft, entries: draft.entries.filter((e) => liveIds.has(e.id)) });
      // 同一個 transaction 一次提交草稿；失敗時保留畫面與草稿供重試。
      await saveGestureAlbumSettings(db, next);
      committed = true;
      baseline.current = JSON.stringify(next);
      setDraft(next);
      await props.onSaved();
      if (returnToSelection) { setPage('select'); setNotice(''); }
      else props.onClose();
    } catch { notify(committed ? '設定已儲存，但列表更新失敗，請再試一次。' : '儲存失敗，變更仍保留在此頁，請再試一次。'); }
    finally { saveLock.current = false; setSaving(false); }
  };

  const create = async () => {
    if (!draft || saveLock.current) return;
    if (!name.trim()) { notify('請輸入相簿名稱'); return; }
    saveLock.current = true; setSaving(true);
    try {
      const maxRow = await db.getFirstAsync<{ m: number | null }>('SELECT MAX(sort_index) AS m FROM album_order');
      const album = await createTargetAlbum(name.trim());
      // 系統相簿立即建立，設定仍留在草稿；不自動選為上滑或下滑目標。
      const sortIndex = Math.max(maxRow?.m ?? -1, ...draft.entries.map((e) => e.sortIndex)) + 1;
      if (!draft.entries.some((e) => e.id === album.id)) {
        const entry = { ...album, sortIndex, hidden: false, pinned: false };
        setDraft({ ...draft, entries: [...draft.entries, entry] });
        // 建立相簿不算可放棄的設定異動，避免只新增相簿就出現多餘確認。
        const initial = JSON.parse(baseline.current) as GestureAlbumDraft;
        baseline.current = JSON.stringify({ ...initial, entries: [...initial.entries, entry] });
      }
      setName(''); setPage('select'); notify('相簿已建立，點選即可設定為手勢目標。');
    } catch { notify('建立失敗，請稍後再試。'); }
    finally { saveLock.current = false; setSaving(false); }
  };

  const entries = draft?.entries ?? [];
  const available = entries.filter((e) => !e.hidden).sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.sortIndex - b.sortIndex);
  const duplicates = new Set(entries.filter((e, index) => entries.findIndex((other) => other.title === e.title) !== index).map((e) => e.title));
  const title = page === 'manage' ? '管理相簿' : page === 'create' ? '新增相簿' : '分類手勢';
  const subtitle = page === 'manage' ? '拖曳可調整順序，並管理固定與顯示狀態。' : page === 'create' ? '建立後可再選為手勢目標' : '';
  return (
    <Modal visible={props.visible} transparent statusBarTranslucent animationType="slide" onRequestClose={requestClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={requestClose} accessibilityRole="button" accessibilityLabel="關閉相簿設定" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.sheet, { backgroundColor: bg }, page === 'manage' && { height: '100%', maxHeight: '100%', borderTopLeftRadius: 0, borderTopRightRadius: 0 }]} accessibilityViewIsModal>
          <View style={[styles.header, page === 'manage' && { paddingTop: insets.top + 8 }]}>
            {page === 'select' && <View style={[styles.handle, { backgroundColor: muted }]} />}
            <View style={styles.titleRow}>
              {page !== 'select' && <Pressable disabled={saving} onPress={requestClose} style={styles.back} accessibilityRole="button" accessibilityLabel="返回分類手勢"><Text style={{ color: text, fontSize: 28 }}>‹</Text></Pressable>}
              <Text accessibilityRole="header" style={[styles.title, { color: text }]}>{title}</Text>
            </View>
            {!!subtitle && <Text style={[styles.subtitle, { color: muted }]}>{subtitle}</Text>}
            {page === 'select' && !loadError && <>
              <View style={[styles.segments, { backgroundColor: card }]}>
                {(['up', 'down'] as const).map((value) => <Pressable key={value} disabled={saving} accessibilityRole="tab" accessibilityState={{ selected: value === anchor }}
                  onPress={() => { setAnchor(value); setNotice(''); list.current?.scrollToOffset({ offset: 0, animated: false }); }}
                  style={[styles.segment, value === anchor && { backgroundColor: text }]}>
                  <Text numberOfLines={1} maxFontSizeMultiplier={1.5} style={{ color: value === anchor ? bg : muted, fontSize: 16, fontWeight: value === anchor ? '600' : '400' }}>{value === 'up' ? '↑ 上滑' : '↓ 下滑'}</Text>
                </Pressable>)}
              </View>
              <View style={styles.status}>
                <Text style={{ color: muted, fontSize: 13 }}>選擇相簿</Text>
                {anchor === 'down' && <Text style={{ color: muted, fontSize: 12 }}>快捷 {draft?.shortcutIds.length ?? 0} / 4</Text>}
              </View>
            </>}
          </View>

          {loading ? <View style={styles.empty}><Text style={{ color: muted }}>載入相簿中…</Text></View> : loadError ? <View style={styles.empty}>
            <Text style={{ color: muted }}>{loadError}</Text><Pressable style={[styles.secondary, { flex: 0, paddingHorizontal: 24, borderColor: border }]} onPress={() => setRetry((value) => value + 1)} accessibilityRole="button"><Text style={{ color: text }}>重新載入</Text></Pressable>
          </View> : page === 'create' ? <View style={styles.createBody}>
            <TextInput value={name} onChangeText={setName} autoFocus editable={!saving} placeholder="例如：旅遊" placeholderTextColor={muted}
              accessibilityLabel="新相簿名稱" style={[styles.input, { color: text, borderColor: border }]} returnKeyType="done" onSubmitEditing={() => void create()} />
            <Text style={[styles.subtitle, { color: muted }]}>相簿會立即建立，放棄設定時仍會保留。</Text>
          </View> : page === 'manage' && draft ? <View style={styles.body}>
            <AlbumManagerList entries={entries} shortcutIds={draft.shortcutIds}
              onToggleShortcut={(id) => {
                if (!draft.shortcutIds.includes(id) && draft.shortcutIds.length >= 4) notify('最多 4 個快捷，請先取消一個。');
                else setDraft(toggleShortcut(draft, id));
              }} onChange={(next) => setDraft((current) => current ? { ...current, entries: next } : current)}
              onHidden={(entry) => {
                setDraft((current) => current ? normalizeGestureDraft({ ...current, entries: current.entries.map((e) => e.id === entry.id ? { ...e, hidden: !e.hidden } : e) }) : current);
                if (!entry.hidden && (draft.upId === entry.id || draft.downId === entry.id || draft.shortcutIds.includes(entry.id))) notify('已隱藏，並移除手勢設定');
              }} />
          </View> : <FlatList ref={list} key={anchor} data={available} keyExtractor={(entry) => entry.id} style={styles.body}
            contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={{ color: muted, paddingVertical: 24 }}>沒有可用的相簿，可新增相簿或到管理頁恢復顯示。</Text>}
            renderItem={({ item }) => {
              const index = draft?.shortcutIds.indexOf(item.id) ?? -1;
              const selected = anchor === 'up' ? draft?.upId === item.id : draft?.downId === item.id;
              return <Pressable disabled={saving} accessibilityRole="radio" accessibilityState={{ checked: selected }}
                accessibilityLabel={`${item.title}${duplicates.has(item.title) ? `，相簿識別碼 ${item.id}` : ''}${anchor === 'down' && index >= 0 ? `，快捷第 ${index + 1} 位` : ''}`}
                style={[styles.albumRow, { backgroundColor: selected ? '#168bff20' : card, borderColor: selected ? '#477aa6' : border, borderWidth: selected ? 1 : 0, borderBottomWidth: StyleSheet.hairlineWidth }]}
                onPress={() => {
                  if (!draft) return;
                  if (anchor === 'up') setDraft({ ...draft, upId: item.id });
                  else setDraft({ ...draft, downId: item.id });
                }}>
                <View style={styles.albumName}><Text numberOfLines={1} style={{ color: text, fontSize: 15 }}>{item.title}</Text>
                  <Text numberOfLines={1} style={{ color: muted, fontSize: 10, marginTop: 3 }}>相簿識別碼：{item.id}</Text></View>
                <Text style={{ width: 24, color: text, fontSize: 20, textAlign: 'center' }}>{selected ? '✓' : ''}</Text>
                {index >= 0 && <View style={[styles.shortcutBadge, { borderColor: '#168BFF' }]}><Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={{ color: text, fontSize: 11 }}>快捷 {index + 1}</Text></View>}
                <Pressable disabled={saving} accessibilityRole="checkbox" accessibilityState={{ checked: index >= 0 }}
                  accessibilityLabel={`${index >= 0 ? '移除' : '加入'}快捷：${item.title}`} hitSlop={4}
                  style={{ minWidth: 36, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
                  onPress={(event) => {
                    event.stopPropagation();
                    if (!draft) return;
                    if (index < 0 && draft.shortcutIds.length >= 4) notify('最多 4 個快捷，請先取消一個。');
                    else setDraft(toggleShortcut(draft, item.id));
                  }}><Text style={{ color: index >= 0 ? '#168BFF' : muted, fontSize: 23 }}>☆</Text></Pressable>
              </Pressable>;
            }} />}

          <View style={[styles.footer, { borderTopColor: border, paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
            {!!notice && <View style={[styles.snackbar, { backgroundColor: card }]} accessibilityLiveRegion="polite"><Text style={{ color: saving ? muted : text, fontSize: 14 }}>{notice}</Text></View>}
            <View style={page === 'select' && !loading && !loadError ? styles.footerActions : undefined}>
            {page === 'select' && !loading && !loadError && <>
              <Pressable disabled={saving} accessibilityRole="button" onPress={() => { setNotice(''); setPage('create'); }} style={[styles.secondary, { borderColor: border }]}><Text maxFontSizeMultiplier={1.5} style={{ color: text, fontSize: 13 }}>＋ 新增相簿</Text></Pressable>
              <Pressable disabled={saving} accessibilityRole="button" onPress={() => { setNotice(''); setPage('manage'); }} style={[styles.secondary, { borderColor: border }]}><Text maxFontSizeMultiplier={1.5} style={{ color: text, fontSize: 13 }}>管理相簿</Text></Pressable>
            </>}
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving || loading }} disabled={saving || loading}
              onPress={() => page === 'manage' ? void save(true) : page === 'create' ? void create() : loadError ? props.onClose() : void save()}
              style={[styles.primary, { flex: page === 'select' && !loadError && !loading ? 0.8 : undefined, backgroundColor: text, opacity: saving || loading ? 0.5 : 1 }]}>
              <Text maxFontSizeMultiplier={1.5} style={{ color: bg, fontSize: 17, fontWeight: '700' }}>{saving ? '處理中…' : page === 'manage' ? '套用並返回' : page === 'create' ? '建立相簿' : loadError ? '關閉' : '完成'}</Text>
            </Pressable>
            </View>
          </View>
          {saving && <View style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { height: '88%', maxHeight: '90%', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  header: { paddingHorizontal: 20, paddingTop: 10, flexShrink: 0 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  back: { width: 40, minHeight: 48, justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '700', flexShrink: 1 },
  subtitle: { fontSize: 11, lineHeight: 17, marginBottom: 12 },
  segments: { flexDirection: 'row', padding: 3, borderRadius: 15, marginBottom: 10 },
  segment: { flex: 1, minHeight: 48, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  status: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  body: { flex: 1, minHeight: 0, marginHorizontal: 16 },
  listContent: { paddingBottom: 16, gap: 0 },
  albumRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 3, borderRadius: 7, gap: 7 },
  albumName: { flex: 1, minWidth: 0 },
  footer: { flexShrink: 0, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingTop: 12, gap: 12 },
  footerActions: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  shortcutBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 6, backgroundColor: '#168bff18', maxWidth: 76 },
  secondary: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center' },
  primary: { minHeight: 48, paddingVertical: 12, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  snackbar: { borderRadius: 12, padding: 12 },
  empty: { flex: 1, padding: 20, justifyContent: 'center', alignItems: 'center', gap: 16 },
  createBody: { flex: 1, paddingHorizontal: 20 },
  input: { borderWidth: 1, borderRadius: 14, minHeight: 52, padding: 14, fontSize: 17 },
});
