const SEED_MEMBERS = [
  {
    id: '1001',
    firstName: 'John',
    lastName: 'Smith',
    branch: 'Downtown Branch',
    status: 'Active',
    savingsBalance: 5230.5,
    subAccounts: [
      { id: 'SA-1', type: 'Checking', balance: 1200.0, openedOn: '2021-03-14' }
    ]
  },
  {
    id: '1002',
    firstName: 'Jane',
    lastName: 'Doe',
    branch: 'Uptown Branch',
    status: 'Active',
    savingsBalance: 12890.15,
    subAccounts: []
  },
  {
    id: '1003',
    firstName: 'Robert',
    lastName: 'Johnson',
    branch: 'Downtown Branch',
    status: 'Closed',
    savingsBalance: 0.0,
    subAccounts: []
  },
  {
    id: '1004',
    firstName: 'Maria',
    lastName: 'Garcia',
    branch: 'Westside Branch',
    status: 'Restricted',
    savingsBalance: 430.22,
    subAccounts: [
      { id: 'SA-2', type: 'CD', balance: 5000.0, openedOn: '2020-11-02' }
    ]
  },
  {
    id: '1005',
    firstName: 'David',
    lastName: 'Lee',
    branch: 'Uptown Branch',
    status: 'Active',
    savingsBalance: 875.4,
    subAccounts: []
  },
  {
    id: '1006',
    firstName: 'Susan',
    lastName: 'Brown',
    branch: 'Downtown Branch',
    status: 'Active',
    savingsBalance: 20310.0,
    subAccounts: [
      { id: 'SA-3', type: 'Savings', balance: 3000.0, openedOn: '2022-06-30' },
      { id: 'SA-4', type: 'Checking', balance: 450.75, openedOn: '2023-01-19' }
    ]
  },
  {
    id: '1007',
    firstName: 'Michael',
    lastName: 'Wilson',
    branch: 'Westside Branch',
    status: 'Active',
    savingsBalance: 3120.6,
    subAccounts: []
  },
  {
    id: '1008',
    firstName: 'Linda',
    lastName: 'Davis',
    branch: 'Uptown Branch',
    status: 'Closed',
    savingsBalance: 0.0,
    subAccounts: []
  }
];

function cloneSeed() {
  return SEED_MEMBERS.map((m) => ({ ...m, subAccounts: m.subAccounts.map((sa) => ({ ...sa })) }));
}

let members = cloneSeed();
let nextSubAccountNum = 5;

function resetData() {
  members = cloneSeed();
  nextSubAccountNum = 5;
}

function getAllMembers() {
  return members;
}

function findMemberById(id) {
  return members.find((m) => m.id === String(id).trim());
}

function searchMembers(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  return members.filter(
    (m) => m.id === q || m.lastName.toLowerCase().includes(q)
  );
}

function addSubAccount(memberId, type, initialDeposit) {
  const member = findMemberById(memberId);
  if (!member) return null;
  const subAccount = {
    id: 'SA-' + nextSubAccountNum++,
    type,
    balance: initialDeposit,
    openedOn: new Date().toISOString().slice(0, 10)
  };
  member.subAccounts.push(subAccount);
  return subAccount;
}

module.exports = {
  resetData,
  getAllMembers,
  findMemberById,
  searchMembers,
  addSubAccount
};
