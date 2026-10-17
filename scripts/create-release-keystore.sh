#!/usr/bin/env bash
# 为静看创建你自己的发布密钥，并将其登记到
# ~/.gradle/gradle.properties（仓库之外，权限为 600）。
# 请亲自运行；密码只在此处输入，既不回显，也不提交到仓库。
# 请备份密钥库和密码：一旦丢失，后续版本将无法
# 将无法直接覆盖升级已安装的应用；卸载会清空本地数据。
set -euo pipefail

STORE="${1:-$HOME/.jingkan/jingkan-release.jks}"
ALIAS="jingkan"
PROPS="$HOME/.gradle/gradle.properties"

if [ -e "$STORE" ]; then
  echo "已存在：$STORE —— 为避免覆盖正式密钥，脚本已停止。" >&2
  exit 1
fi
if [ -f "$PROPS" ] && grep -q '^JINGKAN_UPLOAD_STORE_FILE=' "$PROPS"; then
  echo "$PROPS 已配置 JINGKAN_UPLOAD_*，请先确认后手动处理。" >&2
  exit 1
fi
KEYTOOL="$(command -v keytool || true)"
if [ -z "$KEYTOOL" ]; then
  KEYTOOL="$(/usr/libexec/java_home -v 21 2>/dev/null)/bin/keytool"
fi
[ -x "$KEYTOOL" ] || { echo "找不到 keytool，请安装 JDK 21。" >&2; exit 1; }

read -r -s -p "设置密钥密码（至少 8 位）: " PASS; echo
read -r -s -p "再输入一次: " PASS2; echo
[ "$PASS" = "$PASS2" ] || { echo "两次输入不一致。" >&2; exit 1; }
[ "${#PASS}" -ge 8 ] || { echo "密码至少 8 位。" >&2; exit 1; }

mkdir -p "$(dirname "$STORE")"
chmod 700 "$(dirname "$STORE")"
export JINGKAN_KS_PASS="$PASS"
"$KEYTOOL" -genkeypair -v -storetype PKCS12 -keystore "$STORE" \
  -alias "$ALIAS" -keyalg RSA -keysize 4096 -validity 36500 \
  -dname "CN=Jingkan Personal" \
  -storepass:env JINGKAN_KS_PASS -keypass:env JINGKAN_KS_PASS
unset JINGKAN_KS_PASS
chmod 600 "$STORE"

mkdir -p "$(dirname "$PROPS")"
touch "$PROPS"
chmod 600 "$PROPS"
{
  echo ""
  echo "# 静看 release signing (scripts/create-release-keystore.sh)"
  echo "JINGKAN_UPLOAD_STORE_FILE=$STORE"
  echo "JINGKAN_UPLOAD_STORE_PASSWORD=$PASS"
  echo "JINGKAN_UPLOAD_KEY_ALIAS=$ALIAS"
  echo "JINGKAN_UPLOAD_KEY_PASSWORD=$PASS"
} >> "$PROPS"

echo "完成：$STORE"
echo "已写入 $PROPS（仅本机可读）。请把 keystore 文件和密码备份到安全的地方。"
echo "之后用 ./gradlew assembleRelease -PjingkanRequireReleaseKey=true 构建正式包。"
