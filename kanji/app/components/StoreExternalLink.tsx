/**
 * StoreExternalLink.tsx
 *
 * 店舗外部リンク共通コンポーネント。
 *
 * 現在は ValueCommerce LinkSwitch による自動アフィリエイト変換を前提とした
 * 通常の <a> タグ描画のみ行う。
 *
 * 将来 ValueCommerce MyLink に切り替える場合はこのファイルだけ修正する。
 * - LinkSwitch: src に hotpepper.jp の通常URL → JS が自動変換
 * - MyLink: src を vc-mp.com/... の個別生成URLに差し替え
 *
 * 動作確認 (LinkSwitch):
 *   NEXT_PUBLIC_VC_LINKSWITCH_ID を設定してページを開き、
 *   このコンポーネントが描画するリンクをホバー。
 *   ブラウザのステータスバーに ValueCommerce 経由URLが表示されれば変換済み。
 */

type LinkProps = {
  href: string
  children: React.ReactNode
  className?: string
  /** カード内リンクなど、親のクリックと競合するとき */
  stopPropagation?: boolean
}

/**
 * 店舗外部リンク本体。
 * LinkSwitch の変換対象にするため、href は hotpepper.jp の通常URLをそのまま渡す。
 */
export function StoreExternalLink({ href, children, className, stopPropagation }: LinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
    >
      {children}
    </a>
  )
}

/**
 * PR表記。予約リンクが存在するエリアに1回だけ表示する。
 * ValueCommerce 規約・景品表示法に基づく表示義務を果たすためのもの。
 */
export function AffiliateNote() {
  return (
    <p className="text-center text-[10px] text-stone-400">
      一部リンクにはプロモーションを含みます
    </p>
  )
}
