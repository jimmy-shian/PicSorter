import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';
import { createTargetAlbum } from '@/lib/media';
import { AlbumOrderEditor } from '@/components/AlbumOrderEditor';
import { ArrowCircle, Chevron } from '@/components/GestureIcons';
import type { TargetAlbum } from '@/types';

export interface ChipRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AlbumBarHandle {
  /** 量測目前可見相簿 chip 的螢幕座標，供下拖命中判斷 */
  measureChips: () => Promise<Map<string, ChipRect>>;
}

interface Props {
  targets: TargetAlbum[];
  selectedId: string | null;
  downTargetId?: string | null;
  onSelect: (id: string) => void;
  onSelectDown?: (id: string) => void;
  onAdd: (t: TargetAlbum) => Promise<void>;
  /** 目前來源相簿 id：編輯器與底部列一致，排除來源本身 */
  sourceId: string | null;
  onOrderChanged: () => void;
  /** 下拖進行中：全部相簿顯示可放入提示 */
  dropMode: boolean;
  /** 手指正下方的相簿：突出顯示 */
  highlightId: string | null;
  expanded: boolean;
  onToggleExpand: () => void;
  /** 版面穩定後（展開/收合/目標變化）通知父層重新量測 */
  onLayoutReady?: () => void;
}

function shortChar(title: string): string {
  const t = title.trim();
  if (!t) return '?';
  return [...t][0] ?? '?';
}

export const AlbumBar = forwardRef<AlbumBarHandle, Props>(function AlbumBar(
  {
    targets,
    selectedId,
    downTargetId,
    onSelect,
    onSelectDown,
    onAdd,
    sourceId,
    onOrderChanged,
    dropMode,
    highlightId,
    expanded,
    onToggleExpand,
    onLayoutReady,
  },
  ref,
) {
  const { text, muted, border, card, bg, danger } = useTheme();
  const insets = useSafeAreaInsets();
  const [sheetVisible, setSheetVisible] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [createVisible, setCreateVisible] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chipRefs = useRef(new Map<string, View | null>());

  const showPreview = (id: string) => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    setPreviewId(id);
    previewTimer.current = setTimeout(() => {
      setPreviewId(null);
    }, 1000);
  };

  useImperativeHandle(
    ref,
    () => ({
      measureChips: () => {
        const jobs = targets.map(
          (t) =>
            new Promise<[string, ChipRect | null]>((resolve) => {
              const view = chipRefs.current.get(t.id);
              if (!view) {
                resolve([t.id, null]);
                return;
              }
              try {
                view.measureInWindow((x, y, width, height) => {
                  if (width <= 0 || height <= 0) resolve([t.id, null]);
                  else resolve([t.id, { x, y, width, height }]);
                });
              } catch {
                resolve([t.id, null]);
              }
            }),
        );
        return Promise.all(jobs).then((entries) => {
          const map = new Map<string, ChipRect>();
          for (const [id, rect] of entries) {
            if (rect) map.set(id, rect);
          }
          return map;
        });
      },
    }),
    [targets],
  );

  const handleCreate = async () => {
    const title = name.trim();
    if (!title) {
      setFormError('請輸入相簿名稱');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const album = await createTargetAlbum(title);
      await onAdd(album);
      setName('');
      setCreateVisible(false);
      setSheetVisible(false);
    } catch {
      setFormError('建立失敗，請稍後再試。');
    } finally {
      setBusy(false);
    }
  };

  const handleContainerLayout = (_e: LayoutChangeEvent) => {
    if (dropMode) onLayoutReady?.();
  };

  const selected = targets.find((t) => t.id === selectedId) ?? null;
  const shortcuts = targets.slice(0, 4);
  const previewTitle = previewId ? (targets.find((t) => t.id === previewId)?.title ?? null) : null;

  const renderDropChip = (t: TargetAlbum) => {
    const highlighted = t.id === highlightId;
    return (
      <Pressable
        key={t.id}
        ref={(el) => {
          if (el) chipRefs.current.set(t.id, el);
          else chipRefs.current.delete(t.id);
        }}
        onPress={() => onSelect(t.id)}
        style={[
          styles.dropChip,
          {
            borderColor: highlighted ? text : text,
            borderStyle: highlighted ? 'solid' : 'dashed',
            backgroundColor: highlighted ? text : 'transparent',
          },
        ]}>
        <Text
          style={[styles.dropChipText, { color: highlighted ? bg : text }]}
          numberOfLines={1}>
          {t.title}
        </Text>
      </Pressable>
    );
  };

  // 下拖中：展開全部目標供手指命中（量測用），取代精簡列
  if (dropMode) {
    return (
      <View onLayout={handleContainerLayout} style={[styles.dropWrap, { borderColor: border }]}>
        <Text style={[styles.dropHint, { color: text }]}>拖到下方相簿放開</Text>
        <View style={styles.dropGrid}>
          {targets.map(renderDropChip)}
        </View>
        {highlightId ? (
          <Text style={[styles.dropTarget, { color: muted }]} numberOfLines={1}>
            將放入「{targets.find((t) => t.id === highlightId)?.title ?? ''}」
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <>
    <View onLayout={handleContainerLayout} style={[styles.compactContainer, { borderTopColor: border }]}>
      {/* 左側：上滑目標相簿膠囊（緊湊） */}
      <Pressable
        style={[styles.targetPill, { borderColor: text, backgroundColor: card }]}
        onPress={() => setSheetVisible(true)}>
        <ArrowCircle direction="up" size={16} color={muted} />
        <Text style={[styles.targetTitle, { color: text }]} numberOfLines={1}>
          {selected ? selected.title : '選擇相簿'}
        </Text>
        <Chevron direction="right" size={10} color={muted} />
      </Pressable>

      {/* 右側：4 個微型快捷圓形膠囊 + 展開全部 */}
      <View style={styles.shortcutsWrap}>
        {shortcuts.map((t, i) => {
          const isSel = t.id === downTargetId;
          const isPreview = t.id === previewId;
          return (
            <Pressable
              key={t.id}
              ref={(el) => {
                if (el) chipRefs.current.set(t.id, el);
                else chipRefs.current.delete(t.id);
              }}
              onPress={() => {
                onSelectDown?.(t.id);
              }}
              onLongPress={() => {
                showPreview(t.id);
              }}
              delayLongPress={250}
              style={[
                styles.miniQuickBtn,
                {
                  borderColor: isPreview || isSel ? text : border,
                  backgroundColor: isPreview ? text : isSel ? card : 'transparent',
                },
              ]}>
              <Text style={[styles.miniQuickNum, { color: isPreview ? bg : muted }]}>{i + 1}</Text>
              <Text style={[styles.miniQuickChar, { color: isPreview ? bg : text }]}>
                {shortChar(t.title)}
              </Text>
            </Pressable>
          );
        })}
        {/* 展開全部清單小按鈕 */}
        <Pressable
          style={[styles.moreBtn, { borderColor: border }]}
          onPress={() => setSheetVisible(true)}
          hitSlop={6}>
          <Text style={[styles.moreBtnText, { color: muted }]}>全部</Text>
          <Chevron direction="up" size={9} color={muted} />
        </Pressable>
      </View>

      {previewTitle ? (
        <View style={styles.previewWrap} pointerEvents="none">
          <View style={[styles.previewBubble, { backgroundColor: text }]}>
            <Text style={[styles.previewText, { color: bg }]} numberOfLines={1}>
              {previewTitle}
            </Text>
          </View>
        </View>
      ) : null}
    </View>

    {/* 全螢幕上展：直接往上整片展開，快速看到全部內容 */}
    <Modal
        visible={sheetVisible || expanded}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setSheetVisible(false);
          if (expanded) onToggleExpand();
        }}>
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => {
            setSheetVisible(false);
            if (expanded) onToggleExpand();
          }}>
          <Pressable
            style={[
              styles.sheet,
              { backgroundColor: bg, borderColor: border, paddingBottom: insets.bottom + 16 },
            ]}
            onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: text }]}>選擇分類相簿</Text>
            <Text style={[styles.sheetSub, { color: muted }]}>
              點相簿設為上滑目標 · 點右側按鈕設為下滑目標
            </Text>
            <ScrollView style={styles.sheetList} showsVerticalScrollIndicator={false}>
              {targets.map((t, i) => {
                const activeUp = t.id === selectedId;
                const activeDown = t.id === downTargetId;
                return (
                  <Pressable
                    key={t.id}
                    style={[
                      styles.sheetRow,
                      { borderColor: border, backgroundColor: activeUp ? card : 'transparent' },
                    ]}
                    onPress={() => {
                      onSelect(t.id);
                      setSheetVisible(false);
                      if (expanded) onToggleExpand();
                    }}>
                    <View
                      style={[
                        styles.sheetBadge,
                        { borderColor: activeUp ? text : border, backgroundColor: activeUp ? text : 'transparent' },
                      ]}>
                      <Text style={[styles.sheetBadgeText, { color: activeUp ? bg : muted }]}>
                        {i < 4 ? String(i + 1) : '·'}
                      </Text>
                    </View>
                    <Text
                      style={[styles.sheetRowText, { color: text, fontWeight: activeUp ? '700' : '400' }]}
                      numberOfLines={1}>
                      {t.title}
                    </Text>
                    {activeUp ? <Text style={[styles.sheetTag, { color: text }]}>✓ 上滑</Text> : null}
                    <Pressable
                      style={[
                        styles.sheetDownBtn,
                        {
                          borderColor: activeDown ? text : border,
                          backgroundColor: activeDown ? text : card,
                        },
                      ]}
                      hitSlop={6}
                      onPress={(e) => {
                        e.stopPropagation();
                        onSelectDown?.(t.id);
                      }}>
                      <Text
                        style={[
                          styles.sheetDownBtnText,
                          { color: activeDown ? bg : text },
                        ]}>
                        {activeDown ? '✓ 下滑' : '設為下滑'}
                      </Text>
                    </Pressable>
                  </Pressable>
                );
              })}
              {targets.length === 0 ? (
                <Text style={[styles.sheetEmpty, { color: muted }]}>尚無可用相簿，請先新增。</Text>
              ) : null}
            </ScrollView>
            <View style={styles.sheetBtns}>
              <Pressable
                style={[styles.sheetBtn, { borderColor: border }]}
                onPress={() => setCreateVisible(true)}>
                <Text style={[styles.sheetBtnText, { color: text }]}>＋ 新增相簿</Text>
              </Pressable>
              <Pressable
                style={[styles.sheetBtn, { borderColor: border }]}
                onPress={() => setEditorVisible(true)}>
                <Text style={[styles.sheetBtnText, { color: text }]}>編輯順序</Text>
              </Pressable>
            </View>
            <Pressable
              style={[styles.sheetDone, { backgroundColor: text }]}
              onPress={() => {
                setSheetVisible(false);
                if (expanded) onToggleExpand();
              }}>
              <Text style={[styles.sheetDoneText, { color: bg }]}>完成</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <AlbumOrderEditor
        visible={editorVisible}
        sourceId={sourceId}
        onClose={() => setEditorVisible(false)}
        onChanged={onOrderChanged}
      />

      <Modal visible={createVisible} transparent animationType="fade" onRequestClose={() => setCreateVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: bg, borderColor: border }]}>
            <Text style={[styles.modalTitle, { color: text }]}>新增分類相簿</Text>
            <TextInput
              value={name}
              onChangeText={(v) => {
                setName(v);
                setFormError(null);
              }}
              placeholder="例如：旅遊"
              placeholderTextColor={muted}
              style={[styles.input, { color: text, borderColor: formError ? danger : border }]}
              autoFocus
            />
            {formError ? <Text style={[styles.formError, { color: danger }]}>{formError}</Text> : null}
            <View style={styles.modalBtns}>
              <Pressable onPress={() => setCreateVisible(false)} style={styles.modalBtn}>
                <Text style={{ color: muted }}>取消</Text>
              </Pressable>
              <Pressable onPress={handleCreate} disabled={busy} style={styles.modalBtn}>
                <Text style={{ color: text, fontWeight: '700' }}>{busy ? '建立中…' : '建立'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
});

const styles = StyleSheet.create({
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 6,
  },
  targetPill: {
    flex: 1,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.2,
    borderRadius: 18,
    paddingHorizontal: 10,
    gap: 5,
    minWidth: 0,
    overflow: 'hidden',
  },
  targetTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    minWidth: 0,
  },
  shortcutsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
  },
  miniQuickBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniQuickNum: {
    fontSize: 8,
    fontWeight: '700',
    lineHeight: 10,
  },
  miniQuickChar: {
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 14,
  },
  moreBtn: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 8,
    gap: 2,
  },
  moreBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  previewWrap: {
    position: 'absolute',
    top: -30,
    alignSelf: 'center',
  },
  previewBubble: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    maxWidth: '90%',
  },
  previewText: {
    fontSize: 12,
    fontWeight: '700',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 6,
    gap: 8,
  },
  upLabel: { fontSize: 12, flexShrink: 0 },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  selectedPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 8,
    minWidth: 0,
  },
  selectedText: { flex: 1, fontSize: 14, fontWeight: '700', minWidth: 0 },
  changeText: { fontSize: 12, flexShrink: 0 },
  quickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 10,
  },
  quickLabel: { fontSize: 11, flexShrink: 0, maxWidth: 72 },
  quickBtns: { flex: 1, flexDirection: 'row', gap: 10, alignItems: 'center' },
  quickBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickNum: { fontSize: 10, fontWeight: '700', lineHeight: 12 },
  quickChar: { fontSize: 19, fontWeight: '800', lineHeight: 22 },
  quickEmpty: { fontSize: 12 },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
    paddingBottom: 4,
  },
  editText: { fontSize: 11 },
  editDot: { fontSize: 11 },
  dropWrap: {
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 8,
  },
  dropHint: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  dropGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dropChip: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dropChipText: { fontSize: 14 },
  dropTarget: { fontSize: 12, textAlign: 'center' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    height: '88%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#A8A29E',
    marginBottom: 10,
  },
  sheetTitle: { fontSize: 17, fontWeight: '800' },
  sheetSub: { fontSize: 12, marginTop: 2, marginBottom: 10, lineHeight: 17 },
  sheetList: { flex: 1 },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
    gap: 10,
  },
  sheetBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sheetBadgeText: { fontSize: 13, fontWeight: '800' },
  sheetRowText: { flex: 1, fontSize: 15, minWidth: 0 },
  sheetTag: { fontSize: 11, flexShrink: 0 },
  sheetDownBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    flexShrink: 0,
  },
  sheetDownBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  sheetEmpty: { fontSize: 13, textAlign: 'center', paddingVertical: 16 },
  sheetBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  sheetBtn: { flex: 1, borderWidth: 1.5, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  sheetBtnText: { fontSize: 14, fontWeight: '700' },
  sheetDone: { borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
  sheetDoneText: { fontSize: 15, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { borderWidth: 1, borderRadius: 12, padding: 16 },
  modalTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  formError: { fontSize: 12, marginTop: 6 },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12, gap: 16 },
  modalBtn: { padding: 8 },
});
