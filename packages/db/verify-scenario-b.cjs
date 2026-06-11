const postgres = require('postgres');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');

dotenv.config({ path: '/Users/ujjawalgupta/.gemini/antigravity/scratch/wms/.env' });

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set in env');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL);

async function main() {
  try {
    console.log('--- WMS Scenario B Verification Script ---');

    // 1. Fetch Organization
    const [org] = await sql`SELECT id, name FROM organizations LIMIT 1`;
    if (!org) {
      throw new Error('No organization found in DB. Run seed first.');
    }
    const orgId = org.id;
    console.log(`✓ Scoped to organization: ${org.name} (${orgId})`);

    // 2. Resolve 'Warehouse Staff' Role
    const [role] = await sql`SELECT id, name FROM roles WHERE name = 'Warehouse Staff' AND org_id = ${orgId} LIMIT 1`;
    if (!role) {
      throw new Error('Warehouse Staff role not found in DB. Run seed first.');
    }
    const roleId = role.id;
    console.log(`✓ Target Role resolved: ${role.name} (${roleId})`);

    // 3. Find or Create User (scenario_b_user@wms.local)
    let userId;
    const testEmail = 'scenario_b_user@wms.local';
    const [existingUser] = await sql`SELECT id FROM users WHERE email = ${testEmail} LIMIT 1`;
    
    if (existingUser) {
      userId = existingUser.id;
      console.log(`✓ Using existing test user: ${testEmail} (${userId})`);
      
      // Clean up previous role mappings
      console.log('Cleaning up previous role assignments for test user...');
      await sql`DELETE FROM user_roles WHERE user_id = ${userId}`;
    } else {
      const passwordHash = await bcrypt.hash('ScenarioPassword@123', 10);
      const [newUser] = await sql`
        INSERT INTO users (org_id, email, password_hash, full_name, is_active)
        VALUES (${orgId}, ${testEmail}, ${passwordHash}, 'Scenario B User', true)
        RETURNING id
      `;
      userId = newUser.id;
      console.log(`✓ Created test user: ${testEmail} (${userId})`);
    }

    // 4. Assign 'Warehouse Staff' Role to User
    console.log('Assigning role to user in user_roles table...');
    await sql`
      INSERT INTO user_roles (user_id, role_id)
      VALUES (${userId}, ${roleId})
    `;
    console.log('✓ Role assigned successfully');

    // 5. Query resolved permissions (Simulate /auth/me / getUserPermissions logic)
    console.log('\nQuerying permissions mapping...');
    const userRolesList = await sql`SELECT role_id FROM user_roles WHERE user_id = ${userId}`;
    const userRoleIds = userRolesList.map(r => r.role_id);
    
    const permissionsRows = await sql`
      SELECT p.module, p.action
      FROM role_permissions rp
      INNER JOIN permissions p ON rp.permission_id = p.id
      WHERE rp.role_id IN (${userRoleIds})
    `;

    const permissions = permissionsRows.map(p => `${p.module}:${p.action}`);
    console.log('Resolved Permissions list for user:');
    console.log(JSON.stringify(permissions, null, 2));

    // 6. Assert expected permissions
    const expected = [
      'skus:read',
      'categories:read',
      'locations:read',
      'sites:read',
      'inventory:read',
      'transfers:read',
      'transfers:create',
      'dashboard:read'
    ];

    const forbidden = [
      'users:read',
      'users:create',
      'roles:read',
      'inventory:post',
      'inventory:approve'
    ];

    console.log('\n--- RBAC Verification Assertions ---');
    
    // Assert all expected permissions are present
    for (const p of expected) {
      if (!permissions.includes(p)) {
        throw new Error(`Assertion failed: expected permission '${p}' was not resolved!`);
      }
      console.log(`✓ PASSED: User HAS expected permission: ${p}`);
    }

    // Assert no forbidden permissions are present
    for (const p of forbidden) {
      if (permissions.includes(p)) {
        throw new Error(`Assertion failed: user has forbidden permission '${p}'!`);
      }
      console.log(`✓ PASSED: User DOES NOT HAVE unauthorized permission: ${p}`);
    }

    console.log('\n🎉 SUCCESS: Scenario B RBAC permission checks verified perfectly!');

  } catch (err) {
    console.error('❌ Scenario B Verification Failed:', err.message || err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
