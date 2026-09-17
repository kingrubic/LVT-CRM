import InternalProfilePanel from './InternalProfilePanel.jsx';
import ChangePasswordPanel from './ChangePasswordPanel.jsx';
import DevicesPanel from './DevicesPanel.jsx';
import '../work/work.css';

function ProfilePage({ children }) {
  return (
    <section className="work-user-view profile-workspace profile-page-single">
      {children}
    </section>
  );
}

export function ProfileView({ session }) {
  return (
    <ProfilePage>
      <InternalProfilePanel session={session} />
    </ProfilePage>
  );
}

export function ChangePasswordView() {
  return (
    <ProfilePage>
      <ChangePasswordPanel />
    </ProfilePage>
  );
}

export function DevicesView() {
  return (
    <ProfilePage>
      <DevicesPanel mode="self" />
    </ProfilePage>
  );
}
