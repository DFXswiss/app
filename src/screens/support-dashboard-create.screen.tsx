import { SupportIssueReason, SupportIssueType } from '@dfx.swiss/react';
import { SpinnerSize, StyledLoadingSpinner } from '@dfx.swiss/react-components';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ErrorHint } from 'src/components/error-hint';
import { useSettingsContext } from 'src/contexts/settings.context';
import { useSupportDashboardGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useNavigation } from 'src/hooks/navigation.hook';
import { useStaffVerifiedName } from 'src/hooks/staff-verified-name.hook';
import { ASSIGNABLE_DEPARTMENTS, UserSearchResult, useSupportDashboard } from 'src/hooks/support-dashboard.hook';
import { STAFF_NAME_MISSING, staffNameLoadError } from 'src/components/compliance/staff-identity';
import { reasonLabel, typeLabel } from 'src/util/support-helpers';
import { toBase64 } from 'src/util/utils';

const ISSUE_TYPES = Object.values(SupportIssueType);
const ISSUE_REASONS = Object.values(SupportIssueReason);

export default function SupportDashboardCreateScreen(): JSX.Element {
  useSupportDashboardGuard();

  const { translate } = useSettingsContext();
  const { createIssue, searchUsers } = useSupportDashboard();
  const { navigate } = useNavigation();
  const { name: clerk, isLoading: isLoadingClerk, error: clerkError } = useStaffVerifiedName();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  // User search
  const [searchKey, setSearchKey] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult>();
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Form fields
  const [type, setType] = useState<string>(ISSUE_TYPES[0]);
  const [reason, setReason] = useState<string>(ISSUE_REASONS[0]);
  const [name, setName] = useState('');
  const [department, setDepartment] = useState<string>(ASSIGNABLE_DEPARTMENTS[0]);
  const [message, setMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState<File>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useLayoutOptions({ title: translate('screens/support', 'Create Support Issue'), backButton: true, noMaxWidth: true });

  const doSearch = useCallback(
    (key: string): void => {
      if (key.length < 2) {
        setSearchResults([]);
        setShowResults(false);
        return;
      }
      setIsSearching(true);
      searchUsers(key)
        .then((results) => {
          setSearchResults(results);
          setShowResults(true);
        })
        .catch(() => {
          setSearchResults([]);
          setShowResults(true);
        })
        .finally(() => setIsSearching(false));
    },
    [searchUsers],
  );

  function handleSearchInput(value: string): void {
    setSearchKey(value);
    setSelectedUser(undefined);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 400);
  }

  function handleSelectUser(user: UserSearchResult): void {
    setSelectedUser(user);
    setSearchKey(user.name ? `${user.name} (${user.id})` : String(user.id));
    setShowResults(false);
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();

    if (!selectedUser) {
      setError('Please select a customer');
      return;
    }
    if (!name.trim() || !message.trim()) {
      setError('Please fill all required fields');
      return;
    }
    if (!clerk) {
      setError(clerkError ? staffNameLoadError(clerkError) : STAFF_NAME_MISSING);
      return;
    }

    setIsSubmitting(true);
    setError(undefined);

    try {
      const fileData = selectedFile ? await toBase64(selectedFile) : undefined;
      await createIssue(selectedUser.id, {
        type,
        reason,
        name: name.trim(),
        department,
        author: clerk,
        message: message.trim(),
        file: fileData ?? undefined,
        fileName: selectedFile?.name,
      });
      navigate('/support/dashboard');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create issue');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="w-full flex flex-col gap-4 max-w-2xl text-left">
      {error && <ErrorHint message={error} />}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm p-6 flex flex-col gap-4">
        {/* User Search */}
        <FormField label="Customer *">
          <div ref={searchRef} className="relative">
            <input
              type="text"
              className="w-full px-3 py-2 text-sm border border-dfxGray-400 rounded bg-white text-dfxBlue-800"
              value={searchKey}
              onChange={(e) => handleSearchInput(e.target.value)}
              onFocus={() => searchResults.length > 0 && setShowResults(true)}
              placeholder="Search by name, email, ID, IBAN..."
            />
            {isSearching && (
              <div className="absolute right-3 top-2.5">
                <StyledLoadingSpinner size={SpinnerSize.SM} />
              </div>
            )}

            {/* Selected user info */}
            {selectedUser && (
              <div className="mt-2 px-3 py-2 bg-dfxGray-300 rounded text-xs text-dfxBlue-800 flex justify-between items-center">
                <div>
                  <span className="font-medium">{selectedUser.name || 'No name'}</span>
                  <span className="text-dfxGray-700 ml-2">ID: {selectedUser.id}</span>
                  {selectedUser.mail && <span className="text-dfxGray-700 ml-2">{selectedUser.mail}</span>}
                  <span className="text-dfxGray-700 ml-2">KYC: {selectedUser.kycStatus}</span>
                </div>
                <button
                  type="button"
                  className="text-dfxGray-700 hover:text-dfxBlue-800"
                  onClick={() => {
                    setSelectedUser(undefined);
                    setSearchKey('');
                    setSearchResults([]);
                  }}
                >
                  x
                </button>
              </div>
            )}

            {/* Search results dropdown */}
            {showResults && !selectedUser && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-dfxGray-400 rounded shadow-lg max-h-[200px] overflow-auto">
                {searchResults.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-dfxGray-700">No users found</div>
                ) : (
                  searchResults.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      className="w-full px-3 py-2 text-left text-xs text-dfxBlue-800 hover:bg-dfxGray-300 transition-colors flex justify-between items-center"
                      onClick={() => handleSelectUser(user)}
                    >
                      <div>
                        <span className="font-medium">{user.name || 'No name'}</span>
                        {user.mail && <span className="text-dfxGray-700 ml-2">{user.mail}</span>}
                      </div>
                      <div className="text-dfxGray-700 flex gap-2">
                        <span>ID: {user.id}</span>
                        <span>{user.kycStatus}</span>
                        {user.accountType && <span>{user.accountType}</span>}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </FormField>

        <FormField label="Type *">
          <select
            className="w-full px-3 py-2 text-sm border border-dfxGray-400 rounded bg-white text-dfxBlue-800"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            {ISSUE_TYPES.map((t) => (
              <option key={t} value={t}>
                {translate('screens/support', typeLabel(t))}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Reason *">
          <select
            className="w-full px-3 py-2 text-sm border border-dfxGray-400 rounded bg-white text-dfxBlue-800"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            {ISSUE_REASONS.map((r) => (
              <option key={r} value={r}>
                {translate('screens/support', reasonLabel(r))}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Issue Title *">
          <input
            type="text"
            className="w-full px-3 py-2 text-sm border border-dfxGray-400 rounded bg-white text-dfxBlue-800"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Issue title"
            required
          />
        </FormField>

        <FormField label="Department">
          <select
            className="w-full px-3 py-2 text-sm border border-dfxGray-400 rounded bg-white text-dfxBlue-800"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            {ASSIGNABLE_DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Clerk">
          <p className="w-full px-3 py-2 text-sm text-dfxBlue-800">
            {isLoadingClerk ? '…' : (clerk ?? '—')}
          </p>
          {!isLoadingClerk && !clerk && (
            <ErrorHint message={clerkError ? staffNameLoadError(clerkError) : STAFF_NAME_MISSING} />
          )}
        </FormField>

        <FormField label="Message *">
          <textarea
            className="w-full px-3 py-2 text-sm border border-dfxGray-400 rounded bg-white text-dfxBlue-800 min-h-[100px]"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe the issue..."
            required
            maxLength={4000}
          />
          <div className="text-xs text-dfxGray-700 text-right">{message.length}/4000</div>
        </FormField>

        <FormField label="File">
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpeg,.jpg,.png"
              className="hidden"
              onChange={(e) => setSelectedFile(e.target.files?.[0])}
            />
            <button
              type="button"
              className="px-3 py-1.5 text-xs border border-dfxGray-400 rounded text-dfxBlue-800 hover:bg-dfxGray-300 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              Choose file
            </button>
            {selectedFile && (
              <div className="flex items-center gap-2 text-xs text-dfxBlue-800">
                <span>{selectedFile.name}</span>
                <button
                  type="button"
                  className="text-dfxGray-700 hover:text-dfxBlue-800"
                  onClick={() => {
                    setSelectedFile(undefined);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                >
                  x
                </button>
              </div>
            )}
          </div>
        </FormField>

        <div className="flex justify-end gap-3 mt-2">
          <button
            type="button"
            className="px-4 py-2 text-sm text-dfxGray-700 hover:text-dfxBlue-800 transition-colors"
            onClick={() => navigate('/support/dashboard')}
          >
            {translate('general/actions', 'Cancel')}
          </button>
          <button
            type="submit"
            className="px-6 py-2 bg-dfxBlue-400 text-white rounded text-sm hover:bg-dfxBlue-800 transition-colors disabled:opacity-50"
            disabled={isSubmitting || !selectedUser || !clerk || isLoadingClerk}
          >
            {isSubmitting ? <StyledLoadingSpinner size={SpinnerSize.SM} /> : translate('general/actions', 'Create')}
          </button>
        </div>
      </form>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-dfxBlue-800">{label}</label>
      {children}
    </div>
  );
}
