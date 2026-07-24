import type { MessageKey } from "./en";

/** Japanese UI strings — must cover every English key. */
export const ja: Record<MessageKey, string> = {
  "app.title": "RouteComment",

  "pointer.tap": "タップ",
  "pointer.click": "クリック",

  "common.done": "完了",
  "common.cancel": "キャンセル",
  "common.confirm": "確定",
  "common.close": "閉じる",
  "common.delete": "削除",
  "common.dismiss": "閉じる",
  "common.undo": "元に戻す",
  "common.redo": "やり直す",
  "common.noText": "（テキストなし）",
  "common.untitled": "無題",
  "common.projectFallback": "project",

  "empty.lead": "プロジェクトを開くか、新規作成してください",
  "empty.loadZip": "ZIPを読み込む",
  "empty.createProject": "プロジェクトを作成",

  "choose.edit": "編集",
  "choose.plan": "プラン",

  "panel.close": "閉じる",

  "review.project": "プロジェクト",
  "review.layers": "レイヤー",
  "review.edit": "編集",

  "georef.hint":
    "オーバーレイ → 背景地図の順に{verb}し、2点目で回転・拡大を合わせます。",
  "georef.opacity": "不透明度",

  "followBar.cancelled": "つぶやき範囲をキャンセルしました。",
  "followBar.reselecting": "範囲を選び直しています…",
  "followBar.dragConfirm": "A/Bマーカーをドラッグして範囲を調整できます。",

  "wizard.title": "プロジェクトを作成",
  "wizard.gpxHint": "GPXを読み込むと、地図がコース周辺に移動します。",
  "wizard.gpx": "GPX",
  "wizard.skipGpx": "GPXをスキップ",
  "wizard.mapHint": "地図画像を追加するか、スキップして続行できます。",
  "wizard.mapImage": "地図画像",
  "wizard.skipMap": "地図をスキップ",
  "wizard.georefHint":
    "2点合わせ：オーバーレイの特徴点 → 背景地図の順に{verb}し、同様に2点目を指定。終わったら「完了」をタップ。",
  "wizard.mapOpacity": "地図の不透明度",
  "wizard.cancelMap": "地図画像をキャンセル",
  "wizard.mapRemoved":
    "地図画像を削除しました。別の画像を読み込むか、スキップしてください。",

  "project.title": "プロジェクト",
  "project.saveZip": "ZIPを保存",
  "project.loadZip": "ZIPを読み込む",
  "project.name": "プロジェクト名",
  "project.namePlaceholder": "例：ローカル大会 2026",
  "project.distance": "距離",
  "project.time": "時間",
  "project.elevGain": "累積標高",
  "project.avgHr": "平均心拍",
  "project.unitM": "m",
  "project.unitBpm": "bpm",
  "project.gpx": "GPX",
  "project.mapImage": "地図画像",
  "project.georeference": "位置合わせ",

  "layers.title": "レイヤー",
  "layers.pauseBasemap": "背景地図を切り替えるには再生を一時停止してください",
  "layers.basemap": "背景地図",
  "layers.gpsTrack": "GPSトラック",
  "layers.colorBySpeed": "速度で色分け",
  "layers.trackWidth": "トラックの太さ（{width}）",
  "layers.planWidth": "プランの太さ（{width}）",
  "layers.profileCharts": "プロファイルチャート",
  "layers.elevationFailed": "標高の取得に失敗しました。",

  "commentTool.follow": "つぶやき",
  "commentTool.map": "ノート",
  "commentTool.danmaku": "テロップ",
  "commentTool.hintFollow":
    "GPSトラックを2回{verb}して始点・終点を決め、マーカーをドラッグ",
  "commentTool.hintDanmaku": "トラックを{verb}して流れるコメントを配置",
  "commentTool.hintMap":
    "地図を{verb}してノートを配置（×で長いテキストを折りたたみ）",

  "plan.done": "完了",
  "plan.undo": "元に戻す",
  "plan.add": "プランを追加",
  "plan.activeAria": "アクティブなプラン",
  "plan.select": "プランを選択",
  "plan.colorAria": "プランの色",
  "plan.colorsAria": "プランの色一覧",
  "plan.colorSwatchAria": "色 {color}",
  "plan.clearPath": "パスをクリア…",
  "plan.deletePlan": "プランを削除…",
  "plan.clearConfirm": "すべての点をクリアしますか？",
  "plan.deleteConfirm": "完全に削除しますか？",
  "plan.hintNoPlan":
    "先にプランを追加してから、地図を{verb}して描画してください。",
  "plan.hintEditing":
    "「{name}」を編集中 — 地図を{verb}して追加 · ハンドルをドラッグして移動 · 頂点をダブルクリック / 長押しで削除",
  "plan.defaultName": "プラン",
  "plan.vertexTitle": "ドラッグで移動 · ダブルクリックまたは長押しで削除",
  "plan.midTitle": "ドラッグして頂点を追加",
  "plan.vertexAria": "プラン頂点 {n}",
  "plan.midAria": "プラン頂点を追加",

  "anim.pause": "一時停止",
  "anim.play": "再生",
  "anim.speedTitle": "再生速度",
  "anim.headingTitle": "進行方向を上に",
  "anim.headingLabel": "ヘッドアップ",
  "anim.terrainTitle": "3D地形",
  "anim.terrainLabel": "3D",

  "toast.dismiss": "閉じる",
  "sheet.closeComment": "コメントを閉じる",

  "comment.kindFollow": "つぶやき",
  "comment.kindDanmaku": "テロップ",
  "comment.kindMap": "ノート",
  "comment.placeholder": "コメントを書く…",
  "comment.danmakuPlaceholder": "1行のテロップ…",
  "comment.followPlaceholder": "つぶやきを書く…",
  "comment.editInPopup": "地図上のポップアップでテキストを編集できます。",
  "comment.start": "開始",
  "comment.end": "終了",
  "comment.timePlaceholder": "hh:mm:ss",
  "comment.reselectRange": "地図上で範囲を選び直す",
  "comment.triggerTime": "表示タイミング",
  "comment.atTime": "{time}",
  "comment.mapReadonlyHint":
    "地図上のピンアイコンを{verb}して開きます。ピンの編集・移動はノート編集に切り替えてください。",
  "comment.danmakuReadonlyHint":
    "再生がトリガー時刻に達すると、右から左へ一度スクロール表示されます。",
  "comment.delete": "コメントを削除…",
  "comment.deleteConfirm": "完全に削除しますか？",
  "comment.confirmDelete": "削除を確定",

  "marker.showMap": "ノートを表示",
  "marker.dragResize": "ドラッグでサイズ変更",
  "marker.foldedDrag": "折りたたみノート（ドラッグで移動）",
  "marker.foldedTap": "折りたたみノート — タップで展開",
  "marker.followTitle": "つぶやき — クリックでテキスト編集 / 範囲表示",
  "marker.followAria": "つぶやき",
  "marker.endpointTitle": "トラックに沿ってドラッグして調整",
  "marker.endpointAria": "つぶやき範囲の端点 {label}",
  "marker.danmakuDrag": "テロップ — トラックに沿ってドラッグして時刻を設定",
  "marker.danmakuTap": "テロップ — タップで開く",
  "marker.danmakuAria": "テロップ",

  "profile.elevation": "標高",
  "profile.heartRate": "心拍数",
  "profile.pace": "ペース",
  "profile.unitM": "m",
  "profile.unitBpm": "bpm",
  "profile.unitPace": "min/km",
  "profile.valueM": "{value} m",
  "profile.valueBpm": "{value} bpm",
  "profile.valuePace": "{value} min/km",
  "profile.resizeAria": "プロファイルパネルのサイズ変更",
  "profile.title": "プロファイル",
  "profile.loading": "標高を読み込み中…",
  "profile.unavailable": "標高を取得できません",
  "profile.selectSeries": "上の系列を選択するとチャートが表示されます。",
  "profile.waiting": "標高データを待っています…",

  "map.legendAria": "地図レイヤー凡例",
  "map.gpsTrack": "GPSトラック",
  "map.paceScaleAria": "トラックのペーススケール（min/km）",
  "map.slow": "遅い",
  "map.fast": "速い",
  "map.paceUnit": "min/km",

  "io.failedLoadImage": "画像の読み込みに失敗しました",
  "io.noTrackPoints": "GPXにトラックポイントがありません。",
  "io.loadedTrackPoints": "{count} 件のトラックポイントを読み込みました。",
  "io.failedParseGpx": "GPXの解析に失敗しました。",
  "io.mapPlaced": "地図画像を地図上に配置しました。",
  "io.failedLoadMap": "地図画像の読み込みに失敗しました。",
  "io.projectSaved": "プロジェクトを保存しました。",
  "io.failedSave": "プロジェクトの保存に失敗しました。",
  "io.projectLoaded": "プロジェクトを読み込みました。",
  "io.failedLoadZip": "プロジェクトZIPの読み込みに失敗しました。",
  "io.projectJsonMissing": "ZIP内に project.json がありません",

  "status.startWithGpx":
    "まずGPXを読み込んで大会エリアへ地図を移動し、続けて地図画像を追加してください。",
  "status.finishSetupGpx":
    "セットアップを完了：GPXを読み込む（またはスキップ）し、地図画像を追加（またはスキップ）してください。",
  "status.finishSetupMap":
    "セットアップを完了：地図画像を追加（またはスキップ）して続行してください。",
  "status.georef0": "位置合わせ：地図画像オーバーレイ上の特徴点を{verb}",
  "status.georef1": "位置合わせ：背景地図上の対応点を{verb}",
  "status.georef2": "位置合わせ：オーバーレイ上の2点目の特徴点を{verb}",
  "status.georef3": "位置合わせ：背景地図上の2点目の対応点を{verb}",
  "status.editPlan": "先にプランを追加してから、地図を{verb}して描画",
  "status.editFollow": "GPSトラックを{verb}またはドラッグして範囲を設定",
  "status.editDanmaku": "現在の再生時刻にテロップを追加するには{verb}",
  "status.editMap": "地図を{verb}してノートを配置",
  "status.commentFollow": "GPSトラックを2回{verb}して始点と終点を設定",
  "status.commentDanmaku": "GPSトラックを{verb}して流れるコメントを配置",
  "status.commentMap": "地図を{verb}してノートを配置",
  "status.followReselect": "GPSトラックを2回{verb}して新しい範囲を設定",
  "status.followSaved":
    "つぶやきを保存しました。地図上のポップアップでテキストを編集できます。",
  "status.addMapImage": "地図画像を追加するか、スキップして続行できます。",
  "status.gpxSkipped":
    "GPXをスキップしました。地図画像を追加するか、スキップして続行できます。",
  "status.setupComplete":
    "セットアップ完了。地図画像は後から「編集 → セットアップ」で追加できます。",
  "status.loadMapFirst": "先に地図画像を読み込んでください。",
  "status.aligned":
    "位置合わせ完了。微調整するには2点サイクルを繰り返すか、終わったら「完了」をタップ。",
  "status.pointsTooClose":
    "点が近すぎます — もっと離れた特徴点を選んでください。",
  "status.addPlanFirst":
    "先にプランを追加してから、地図をタップして描画してください。",
  "status.loadTrackDanmaku":
    "テロップを追加する前にGPSトラックを読み込んでください。",
  "status.placeDanmaku":
    "GPSトラック付近を{verb}してテロップを配置してください。",
  "status.danmakuAdded":
    "テロップを追加しました。パネルでテキストを編集するか、マーカーをトラックに沿ってドラッグできます。",
  "status.loadTrackFollow":
    "つぶやきを追加する前にGPSトラックを読み込んでください。",
  "status.dragEndpoints":
    "端点マーカーをドラッグして調整し、「確定」を押してください。",
  "status.nearTrackRange":
    "GPSトラック付近を{verb}して範囲を設定してください。",
  "status.startSet":
    "始点を設定しました。トラックをもう一度{verb}して終点を設定。",
  "status.endTooClose":
    "終点が始点に近すぎます — トラック上でもっと離れた位置を選んでください。",
  "status.dragConfirmRedo":
    "マーカーをドラッグして調整し「確定」— または「やり直す」で選び直し。",
};
