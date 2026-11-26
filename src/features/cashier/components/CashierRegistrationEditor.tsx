import { useEffect, useState } from 'react';
import { pb } from '../../../db/pocketbase';
import type { AddOn, Course, Level, Organization, Package, Registration, SchoolCourse, SessionType } from '../../../types';
import { Modal } from '../../../components/common/Modal';
import { DataFeedback } from '../../../components/common/DataFeedback';
import { EditStudentModal } from '../../admin/components/EditStudentModal';

interface EditData {
  registration: Registration;
  organizations: Organization[];
  courses: Course[];
  packages: Package[];
  addOns: AddOn[];
  levels: Level[];
  schoolCourses: SchoolCourse[];
}

const expand = 'organization,level,course,package,session_type';

export function CashierRegistrationEditor({ id, sessionTypes, onClose, onSaved }: {
  id: string;
  sessionTypes: SessionType[];
  onClose: () => void;
  onSaved: (record: Registration) => void;
}) {
  const [data, setData] = useState<EditData | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState<{ attempt: number; ineligible?: boolean }>();
  const error = failure?.attempt === attempt ? failure : undefined;

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    void Promise.all([
      pb.collection('registrations').getOne<Registration>(id, { expand, cache: 'no-store', signal }),
      pb.collection('organizations').getFullList<Organization>({ sort: 'name', signal }),
      pb.collection('courses').getFullList<Course>({ sort: 'name', signal }),
      pb.collection('packages').getFullList<Package>({ sort: 'name', signal }),
      pb.collection('add_ons').getFullList<AddOn>({ sort: 'name', signal }),
      pb.collection('levels').getFullList<Level>({ sort: 'name', signal }),
      pb.collection('school_courses').getFullList<SchoolCourse>({ signal }),
      pb.send<string[]>('/api/studioflow/cashier-editable-registrations', { query: { id }, cache: 'no-store', signal }),
    ]).then(([registration, organizations, courses, packages, addOns, levels, schoolCourses, eligible]) => {
      if (signal.aborted) return;
      if (!eligible.includes(id) || registration.status !== 'pending_payment' || registration.paid_amount !== 0 || registration.job_order_no) {
        setFailure({ attempt, ineligible: true });
      } else {
        setData({ registration, organizations, courses, packages, addOns, levels, schoolCourses });
      }
    }).catch((reason: unknown) => {
      if (signal.aborted) return;
      console.error('Failed to load registration editor:', reason);
      setFailure({ attempt });
    });
    return () => controller.abort();
  }, [id, attempt]);

  if (!data) {
    return (
      <Modal title="Edit Client" subtitle={`Registration ${id}`} onClose={onClose} size="xl" fixedHeight>
        <DataFeedback loading={!error} loadingMessage="Loading registration…"
          error={error?.ineligible ? 'This client is no longer eligible for editing. Check for a payment or an issued job order.'
            : error ? 'Could not open this registration.' : undefined}
          onRetry={error?.ineligible ? undefined : () => setAttempt((current) => current + 1)} />
      </Modal>
    );
  }
  return (
    <EditStudentModal registration={data.registration} organizations={data.organizations} courses={data.courses}
      packages={data.packages} addOnCatalog={data.addOns} cashierCatalog={{ ...data, sessionTypes }} onClose={onClose}
      onSave={async (registrationId, changes) => {
        const saved = await pb.collection('registrations').update<Registration>(
          registrationId, { ...changes, cashier_edit_version: data.registration.updated }, { expand },
        );
        onSaved(saved);
      }} />
  );
}
