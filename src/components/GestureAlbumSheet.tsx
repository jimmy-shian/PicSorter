import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, Alert, FlatList, KeyboardAvoidingView, Modal,
  Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { getPref, setPref } from '@/lib/db';
import { getAlbumEntries } from '@/lib/album-order';
import { saveGestureAlbumSettings } from '@/lib/gesture-album-storage';
import { createTargetAlbum, listTargetAlbums } from '@/lib/media';
import {
  assignShortcutSlot,
  clearShortcut,
  normalizeGestureDraft,
  type GestureAlbumDraft,
} from '@/lib/gesture-albums';
import { useTheme } from '@/lib/theme';
import { AlbumSearch } from './AlbumSearch';
import { AlbumManagerList } from './AlbumManagerList';

const ACCENT = '#168BFF';

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
  const [keyword, setKeyword] = useState('');
  const [retry, setRetry] = useState(0);
  const list = useRef<FlatList>(null);
  const notify = (message: string) => { setNotice(message); AccessibilityInfo.announceForAccessibility(message); };

  useEffect(() => {
    if (!props.visible) return;
    let active = true;
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      setLoading(true); setLoadError(''); setNotice(''); setDraft(null); setPage('select'); setName(''); setKeyword('');
      setAnchor(propsRef.current.anchor);
      try {
        const live = await listTargetAlbums(props.sourceId);
        const { visible, hidden } = await getAlbumEntries(db, live);
        const next = normalizeGestureDraft({
          entries: [...visible, ...hidden].sort((a, b) => a.sortIndex - b.sortIndex),
          upId: propsRef.current.upId,
          downId: propsRef.current.downId,
          shortcutIds: propsRef.current.shortcutIds,
        });
        if (!active) return;
        baseline.current = JSON.stringify(next);
        setDraft(next);
      } catch {
        if (active) setLoadError('無法載入相簿，請確認相簿存取權限後重試。');
      } finally {
        if (active) setLoading(false);
      }
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
      setNotice('長按把手拖曳可調整順序，點擊快捷標籤可互換位置');
      await setPref(db, 'has_seen_album_drag_hint', 'true');
    })().catch(() => {});
    return () => { active = false; };
  }, [db, page, props.visible]);

  const requestClose = () => {
    if (saveLock.current) return;
    if (page === 'create') { setPage('select'); setNotice(''); return; }
    if (page === 'manage') { setPage('select'); setNotice(''); return; }
    if (draft && JSON.stringify(draft) !== baseline.current) {
      Alert.alert('放棄變更？', '尚未儲存的手勢與相簿設定將會還原。已建立的相簿會保留。', [
        { text: '取消', style: 'cancel' }, { text: '放棄', style: 'destructive', onPress: props.onClose },
      ]);
    } else props.onClose();
  };

  const save = async () => {
    if (!draft || saveLock.current) return;
    saveLock.current = true; setSaving(true); setNotice('');
    let committed = false;
    try {
      const live = await listTargetAlbums(props.sourceId);
      const liveIds = new Set(live.map((e) => e.id));
      const next = normalizeGestureDraft({
        ...draft,
        entries: draft.entries.filter((e) => liveIds.has(e.id) || e.id.startsWith('virtual:')),
      });
      await saveGestureAlbumSettings(db, next);
      committed = true;
      baseline.current = JSON.stringify(next);
      setDraft(next);
      await props.onSaved();
      props.onClose();
    } catch {
      notify(committed ? '設定已儲存，但列表更新失敗，請再試一次。' : '儲存失敗，變更仍保留在此頁，請再試一次。');
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  const create = async () => {
    if (!draft || saveLock.current) return;
    if (!name.trim()) { notify('請輸入相簿名稱'); return; }
    saveLock.current = true; setSaving(true);
    try {
      const maxRow = await db.getFirstAsync<{ m: number | null }>('SELECT MAX(sort_index) AS m FROM album_order');
      const album = await createTargetAlbum(name.trim());
      const sortIndex = Math.max(maxRow?.m ?? -1, ...draft.entries.map((e) => e.sortIndex)) + 1;
      const entry = { ...album, sortIndex, hidden: false, pinned: false };
      // 虛擬相簿先持久化於 album_order 表，重開機仍可保留
      await db.runAsync(
        'INSERT INTO album_order (album_id, title, sort_index, hidden, pinned) VALUES (?, ?, ?, 0, 0)',
        entry.id, entry.title, sortIndex,
      );
      if (!draft.entries.some((e) => e.id === album.id)) {
        setDraft({ ...draft, entries: [...draft.entries, entry] });
        const initial = JSON.parse(baseline.current) as GestureAlbumDraft;
        baseline.current = JSON.stringify({ ...initial, entries: [...initial.entries, entry] });
      }
      setName('');
      setPage('select');
      notify(`已建立相簿「${album.title}」，點選即可設定為手勢目標。`);
    } catch {
      notify('建立失敗，請稍後再試。');
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  const entries = draft?.entries ?? [];
  const query = keyword.trim().toLocaleLowerCase();
  const selectedTargetId = anchor === 'up' ? draft?.upId : draft?.downId;

  // 被選擇的相簿排在最上方
  const available = entries
    .filter((e) => !e.hidden && e.title.toLocaleLowerCase().includes(query))
    .sort((a, b) => {
      const aSelected = a.id === selectedTargetId ? 1 : 0;
      const bSelected = b.id === selectedTargetId ? 1 : 0;
      if (aSelected !== bSelected) return bSelected - aSelected;
      return Number(b.pinned) - Number(a.pinned) || a.sortIndex - b.sortIndex;
    });

  const title = page === 'manage' ? '管理相簿' : page === 'create' ? '新增相簿' : '分類手勢';
  const subtitle = page === 'manage' ? '拖曳可調整順序，點擊快捷標籤可更換位置。' : page === 'create' ? '建立後可立即選為手勢目標' : '';

  return (
    <Modal visible={props.visible} transparent statusBarTranslucent animationType="slide" onRequestClose={requestClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={requestClose} accessibilityRole="button" accessibilityLabel="關閉相簿設定" />
        <KeyboardAvoidingView behavior="padding" style={[styles.sheet, { backgroundColor: bg }]} accessibilityViewIsModal>
          <View style={styles.header}>
            <View style={[styles.handle, { backgroundColor: muted }]} />
            <View style={styles.titleRow}>
              {page === 'create' && (
                <Pressable disabled={saving} onPress={() => setPage('select')} style={styles.back} accessibilityRole="button" accessibilityLabel="返回選擇相簿">
                  <Text style={{ color: text, fontSize: 28 }}>‹</Text>
                </Pressable>
              )}
              <Text accessibilityRole="header" style={[styles.title, { color: text }]}>{title}</Text>
              <View style={{ flex: 1 }} />
              {page === 'select' && !loadError && !loading && (
                <Pressable
                  disabled={saving}
                  onPress={() => { setNotice(''); setPage('manage'); }}
                  style={styles.headerActionBtn}
                  accessibilityRole="button"
                  accessibilityLabel="編輯相簿順序與快捷">
                  <Text style={{ color: ACCENT, fontSize: 16, fontWeight: '600' }}>編輯</Text>
                </Pressable>
              )}
              {page === 'manage' && (
                <Pressable
                  disabled={saving}
                  onPress={() => setPage('select')}
                  style={styles.headerActionBtn}
                  accessibilityRole="button"
                  accessibilityLabel="完成編輯">
                  <Text style={{ color: ACCENT, fontSize: 16, fontWeight: '600' }}>完成編輯</Text>
                </Pressable>
              )}
            </View>
            {!!subtitle && <Text style={[styles.subtitle, { color: muted }]}>{subtitle}</Text>}

            {page === 'select' && !loadError && (
              <>
                <View style={[styles.segments, { backgroundColor: card }]}>
                  {(['up', 'down'] as const).map((value) => (
                    <Pressable
                      key={value}
                      disabled={saving}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: value === anchor }}
                      onPress={() => {
                        setAnchor(value);
                        setNotice('');
                        list.current?.scrollToOffset({ offset: 0, animated: false });
                      }}
                      style={[styles.segment, value === anchor && { backgroundColor: text }]}>
                      <Text
                        numberOfLines={1}
                        maxFontSizeMultiplier={1.5}
                        style={{ color: value === anchor ? bg : muted, fontSize: 16, fontWeight: value === anchor ? '600' : '400' }}>
                        {value === 'up' ? '↑ 上滑' : '↓ 下滑'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.status}>
                  <Text style={{ color: muted, fontSize: 13 }}>選擇相簿</Text>
                  {anchor === 'down' && (
                    <Text style={{ color: muted, fontSize: 12 }}>
                      快捷 {draft?.shortcutIds.filter(Boolean).length ?? 0} / 4
                    </Text>
                  )}
                </View>
              </>
            )}

            {page !== 'create' && !loading && !loadError && (
              <View style={{ marginTop: 4, marginBottom: 8 }}>
                <AlbumSearch value={keyword} onChange={setKeyword} disabled={saving} />
              </View>
            )}
          </View>

          {loading ? (
            <View style={styles.empty}><Text style={{ color: muted }}>載入相簿中…</Text></View>
          ) : loadError ? (
            <View style={styles.empty}>
              <Text style={{ color: muted }}>{loadError}</Text>
              <Pressable
                style={[styles.secondary, { flex: 0, paddingHorizontal: 24, borderColor: border }]}
                onPress={() => setRetry((value) => value + 1)}
                accessibilityRole="button">
                <Text style={{ color: text }}>重新載入</Text>
              </Pressable>
            </View>
          ) : page === 'create' ? (
            <View style={styles.createBody}>
              <TextInput
                value={name}
                onChangeText={setName}
                autoFocus
                editable={!saving}
                placeholder="例如：旅遊"
                placeholderTextColor={muted}
                accessibilityLabel="新相簿名稱"
                style={[styles.input, { color: text, borderColor: border }]}
                returnKeyType="done"
                onSubmitEditing={() => void create()}
              />
              <Text style={[styles.subtitle, { color: muted, marginTop: 8 }]}>
                相簿建立後可在手勢與快捷中直接使用；套用時將自動於手機建立資料夾。
              </Text>
            </View>
          ) : page === 'manage' && draft ? (
            <View style={styles.body}>
              <AlbumManagerList
                keyword={keyword}
                entries={entries}
                shortcutIds={draft.shortcutIds}
                onAssignShortcut={(id, slotIndex) => {
                  setDraft(assignShortcutSlot(draft, id, slotIndex));
                }}
                onClearShortcut={(id) => {
                  setDraft(clearShortcut(draft, id));
                }}
                onChange={(next) => setDraft((current) => current ? { ...current, entries: next } : current)}
                onHidden={(entry) => {
                  setDraft((current) =>
                    current
                      ? normalizeGestureDraft({
                          ...current,
                          entries: current.entries.map((e) => (e.id === entry.id ? { ...e, hidden: !e.hidden } : e)),
                        })
                      : current,
                  );
                  if (!entry.hidden && (draft.upId === entry.id || draft.downId === entry.id || draft.shortcutIds.includes(entry.id))) {
                    notify('已隱藏，並移除手勢設定');
                  }
                }}
              />
            </View>
          ) : (
            <FlatList
              ref={list}
              key={anchor}
              data={available}
              keyExtractor={(entry) => entry.id}
              style={styles.body}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={{ color: muted, paddingVertical: 24 }}>
                  {query ? `找不到符合「${keyword.trim()}」的相簿` : '沒有可用的相簿，可新增相簿或點右上角編輯恢復顯示。'}
                </Text>
              }
              renderItem={({ item }) => {
                const index = draft?.shortcutIds.indexOf(item.id) ?? -1;
                const selected = anchor === 'up' ? draft?.upId === item.id : draft?.downId === item.id;
                return (
                  <Pressable
                    disabled={saving}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`${item.title}${anchor === 'down' && index >= 0 ? `，快捷第 ${index + 1} 位` : ''}`}
                    style={[
                      styles.albumRow,
                      {
                        backgroundColor: selected ? '#168bff1c' : card,
                        borderColor: selected ? ACCENT : border,
                        borderWidth: selected ? 1.5 : 1,
                      },
                    ]}
                    onPress={() => {
                      if (!draft) return;
                      if (anchor === 'up') setDraft({ ...draft, upId: item.id });
                      else setDraft({ ...draft, downId: item.id });
                    }}>
                    <View style={styles.albumName}>
                      <Text
                        numberOfLines={1}
                        style={{
                          color: selected ? (anchor === 'up' ? ACCENT : text) : text,
                          fontSize: 15,
                          fontWeight: selected ? '600' : '400',
                        }}>
                        {item.title}
                      </Text>
                    </View>
                    <Text
                      style={{
                        width: 28,
                        color: selected ? ACCENT : 'transparent',
                        fontSize: 20,
                        textAlign: 'center',
                        fontWeight: '700',
                      }}>
                      ✓
                    </Text>
                    {/* 上滑不用快捷設定，僅下滑且已被設為快捷時顯示標籤 */}
                    {anchor === 'down' && index >= 0 && (
                      <View style={[styles.shortcutBadge, { borderColor: ACCENT }]}>
                        <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={{ color: text, fontSize: 11, fontWeight: '500' }}>
                          快捷 {index + 1}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                );
              }}
            />
          )}

          <View style={[styles.footer, { borderTopColor: border, paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
            {!!notice && (
              <View style={[styles.snackbar, { backgroundColor: card }]} accessibilityLiveRegion="polite">
                <Text style={{ color: saving ? muted : text, fontSize: 14 }}>{notice}</Text>
              </View>
            )}
            <View style={styles.footerActions}>
              {page !== 'create' && !loading && !loadError && (
                <Pressable
                  disabled={saving}
                  accessibilityRole="button"
                  onPress={() => { setNotice(''); setPage('create'); }}
                  style={[styles.secondary, { borderColor: border }]}>
                  <Text maxFontSizeMultiplier={1.5} style={{ color: text, fontSize: 14, fontWeight: '600' }}>
                    ＋ 新增相簿
                  </Text>
                </Pressable>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: saving || loading }}
                disabled={saving || loading}
                onPress={() => (page === 'create' ? void create() : loadError ? props.onClose() : void save())}
                style={[
                  styles.primary,
                  {
                    flex: page !== 'create' && !loadError && !loading ? 1.2 : 1,
                    backgroundColor: text,
                    opacity: saving || loading ? 0.5 : 1,
                  },
                ]}>
                <Text maxFontSizeMultiplier={1.5} style={{ color: bg, fontSize: 17, fontWeight: '700' }}>
                  {saving ? '處理中…' : page === 'create' ? '建立相簿' : loadError ? '關閉' : '完成'}
                </Text>
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
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  back: { width: 36, minHeight: 44, justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, marginBottom: 6 },
  title: { fontSize: 22, fontWeight: '700', flexShrink: 1 },
  headerActionBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 },
  subtitle: { fontSize: 12, lineHeight: 17, marginBottom: 8 },
  segments: { flexDirection: 'row', padding: 3, borderRadius: 15, marginBottom: 10 },
  segment: { flex: 1, minHeight: 44, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  status: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  body: { flex: 1, minHeight: 0, marginHorizontal: 16 },
  listContent: { paddingVertical: 8, gap: 8, paddingBottom: 20 },
  albumRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
  },
  albumName: { flex: 1, minWidth: 0 },
  footer: { flexShrink: 0, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingTop: 12, gap: 12 },
  footerActions: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  shortcutBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#168bff18', maxWidth: 80 },
  secondary: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center' },
  primary: { minHeight: 48, paddingVertical: 12, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  snackbar: { borderRadius: 12, padding: 12 },
  empty: { flex: 1, padding: 20, justifyContent: 'center', alignItems: 'center', gap: 16 },
  createBody: { flex: 1, paddingHorizontal: 20, paddingTop: 10 },
  input: { borderWidth: 1, borderRadius: 14, minHeight: 52, padding: 14, fontSize: 17 },
});
