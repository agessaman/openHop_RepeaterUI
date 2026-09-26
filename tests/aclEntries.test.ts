import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { normalizePublicKey, withAclRole } from '@/utils/aclRoles'

const setACLPermissions = vi.fn()

vi.mock('@/utils/api', () => ({
  default: { setACLPermissions: (...args: unknown[]) => setACLPermissions(...args) },
}))

const KEY = '87b98e21e7858c0b74da819fdd40507df5f4e6cd38c798d27f1ef888a4e4c922'

describe('ACL role helpers', () => {
  it('accepts a pasted key with a 0x prefix, spaces and colons', () => {
    expect(normalizePublicKey(`  0x${KEY.slice(0, 8).toUpperCase()} ${KEY.slice(8)} `)).toBe(KEY)
    expect(normalizePublicKey(KEY.match(/../g)!.join(':'))).toBe(KEY)
  })

  it('rejects anything but a full key', () => {
    expect(normalizePublicKey(KEY.slice(0, 62))).toBeNull()
    expect(normalizePublicKey(KEY + 'ab')).toBeNull()
    expect(normalizePublicKey('zz' + KEY.slice(2))).toBeNull()
  })

  it('replaces the role and keeps the upper bits', () => {
    expect(withAclRole(0x81, 3)).toBe(0x83)
    expect(withAclRole(0x03, 2)).toBe(0x02)
    expect(withAclRole(undefined, 1)).toBe(0x01)
  })
})

describe('AclEntryModal', () => {
  beforeEach(() => {
    setACLPermissions.mockReset()
  })

  async function open(props: Record<string, unknown> = {}) {
    const { default: AclEntryModal } = await import('@/components/modals/AclEntryModal.vue')
    return mount(AclEntryModal, {
      props: {
        show: true,
        identities: [
          { name: 'repeater', type: 'repeater' },
          { name: 'General', type: 'room_server' },
        ],
        ...props,
      },
      global: { stubs: { Teleport: true, Spinner: true } },
    })
  }

  it('sends the normalised key, identity and role', async () => {
    setACLPermissions.mockResolvedValue({ success: true, message: 'Entry saved' })
    const wrapper = await open()

    await wrapper.find('#acl-pubkey').setValue(`0x${KEY.toUpperCase()}`)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(setACLPermissions).toHaveBeenCalledWith({
      identity_name: 'repeater',
      client_pubkey: KEY,
      permissions: 3,
    })
    expect(wrapper.emitted('saved')?.[0]).toEqual(['Entry saved'])
  })

  it('does not submit a partial key and says why', async () => {
    const wrapper = await open()
    await wrapper.find('#acl-pubkey').setValue(KEY.slice(0, 10))
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(setACLPermissions).not.toHaveBeenCalled()
    expect(wrapper.find('#acl-pubkey-help').text()).toContain('64 hex characters')
  })

  it('warns that a room server keeps only admins across restarts', async () => {
    const wrapper = await open({ initialIdentity: 'General' })
    expect(wrapper.text()).not.toContain('keep only admins')
    await wrapper.find('#acl-role').setValue('2')
    expect(wrapper.text()).toContain('Room servers keep only admins')
  })

  it('shows the backend error and stays open', async () => {
    setACLPermissions.mockResolvedValue({ success: false, error: 'the access list is full of admins' })
    const wrapper = await open()
    await wrapper.find('#acl-pubkey').setValue(KEY)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('full of admins')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })
})
