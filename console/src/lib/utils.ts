import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// "bank.member.savings-lookup" -> "Bank › Member › Savings Lookup"
export function formatCapabilityId(capabilityId: string): string {
  return capabilityId
    .split('.')
    .map((segment) =>
      segment
        .split('-')
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    )
    .join(' › ')
}
