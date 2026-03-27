// 닉네임 첫 글자 기반 원형 아바타

interface NicknameAvatarProps {
    name: string   // 표시 닉네임 (첫 글자만 사용)
    size?: 'sm' | 'md'
}

export default function NicknameAvatar({ name, size = 'sm' }: NicknameAvatarProps) {
    const initial = name.charAt(0) || '?'
    const dim = size === 'sm' ? 'w-5 h-5 text-[10px]' : 'w-7 h-7 text-sm'

    return (
        <span
            className={`inline-flex items-center justify-center rounded-full font-semibold bg-primary-light text-primary shrink-0 ${dim}`}
            aria-hidden="true"
        >
            {initial}
        </span>
    )
}
