/**
 * Role Analytics Dashboard Component
 * 
 * Comprehensive analytics dashboard for role-based access control:
 * - Role distribution statistics
 * - Permission usage analytics
 * - User activity metrics
 * - Security insights
 * - Trend analysis
 */

'use client';

import { useState, useEffect } from 'react';
import {
  BarChart3,
  PieChart,
  TrendingUp,
  TrendingDown,
  Users,
  Shield,
  Key,
  Activity,
  AlertTriangle,
  CheckCircle,
  Calendar,
  Download,
  RefreshCw,
  Eye,
  Filter,
  Search,
  Building2,
  Clock,
  Zap,
  Target,
  Award,
  Lock
} from 'lucide-react';
import { useRole } from '@/components/rbac/RoleProvider';
import { ApiClient, ApiClientError } from '@/lib/api-client';

interface RoleAnalytics {
  overview: {
    totalUsers: number;
    totalRoles: number;
    totalPermissions: number;
    activeUsers: number;
    inactiveUsers: number;
    lastUpdated: string;
  };
  roleDistribution: {
    template: string;
    userCount: number;
    percentage: number;
    trend: 'up' | 'down' | 'stable';
    change: number;
  }[];
  permissionUsage: {
    permission: string;
    category: string;
    userCount: number;
    roleCount: number;
    utilizationRate: number;
  }[];
  userTypeBreakdown: {
    userType: string;
    count: number;
    percentage: number;
    activeCount: number;
    averagePermissions: number;
  }[];
  restaurantAnalytics: {
    restaurantId: string;
    restaurantName: string;
    userCount: number;
    roleCount: number;
    permissionCount: number;
    lastActivity: string;
  }[];
  securityInsights: {
    type: 'warning' | 'info' | 'success' | 'error';
    title: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
    actionRequired: boolean;
    count?: number;
  }[];
  trends: {
    period: string;
    newRoles: number;
    removedRoles: number;
    permissionChanges: number;
    userActivations: number;
    userDeactivations: number;
  }[];
}

interface RoleAnalyticsDashboardProps {
  className?: string;
}

export function RoleAnalyticsDashboard({ className = '' }: RoleAnalyticsDashboardProps) {
  const { hasPermission } = useRole();
  const [analytics, setAnalytics] = useState<RoleAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | '90d' | '1y'>('30d');
  const [selectedRestaurant, setSelectedRestaurant] = useState<string>('all');
  const [selectedUserType, setSelectedUserType] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    fetchAnalytics();
  }, [selectedPeriod, selectedRestaurant, selectedUserType]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(fetchAnalytics, 30000); // Refresh every 30 seconds
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, selectedPeriod, selectedRestaurant, selectedUserType]);

  const fetchAnalytics = async () => {
    try {
      const params = new URLSearchParams({
        period: selectedPeriod,
        ...(selectedRestaurant !== 'all' && { restaurantId: selectedRestaurant }),
        ...(selectedUserType !== 'all' && { userType: selectedUserType })
      });

      const data = await ApiClient.get<{
        analytics: RoleAnalytics;
      }>(`/api/admin/analytics/roles?${params}`);

      setAnalytics(data.analytics);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportAnalytics = async () => {
    try {
      const params = new URLSearchParams({
        period: selectedPeriod,
        format: 'csv',
        ...(selectedRestaurant !== 'all' && { restaurantId: selectedRestaurant }),
        ...(selectedUserType !== 'all' && { userType: selectedUserType })
      });

      window.open(`/api/admin/analytics/roles/export?${params}`, '_blank');
    } catch (error) {
      console.error('Failed to export analytics:', error);
    }
  };

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      case 'error':
        return <AlertTriangle className="h-5 w-5 text-red-600" />;
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      default:
        return <Activity className="h-5 w-5 text-blue-600" />;
    }
  };

  const getInsightBadgeColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'bg-red-100 text-red-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'down':
        return <TrendingDown className="h-4 w-4 text-red-600" />;
      default:
        return <div className="h-4 w-4" />;
    }
  };

  if (!hasPermission('analytics:read')) {
    return (
      <div className="text-center py-12">
        <Lock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-500">You don't have permission to view analytics</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`${className}`}>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className={`${className}`}>
        <div className="text-center py-12">
          <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">Failed to load analytics</p>
          <button
            onClick={fetchAnalytics}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center">
            <BarChart3 className="h-6 w-6 mr-2" />
            Role Analytics Dashboard
          </h2>
          <p className="text-sm text-gray-600">
            Last updated: {new Date(analytics.overview.lastUpdated).toLocaleString()}
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="1y">Last year</option>
          </select>
          
          <div className="flex items-center space-x-2">
            <label className="flex items-center text-sm">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mr-2"
              />
              Auto-refresh
            </label>
            
            <button
              onClick={fetchAnalytics}
              className="p-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            
            {hasPermission('analytics:export') && (
              <button
                onClick={exportAnalytics}
                className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
              >
                <Download className="h-4 w-4 mr-1 inline" />
                Export
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <Users className="h-8 w-8 text-blue-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Users</p>
              <p className="text-2xl font-bold text-gray-900">{analytics.overview.totalUsers}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <Shield className="h-8 w-8 text-purple-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Roles</p>
              <p className="text-2xl font-bold text-gray-900">{analytics.overview.totalRoles}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <Key className="h-8 w-8 text-green-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Permissions</p>
              <p className="text-2xl font-bold text-gray-900">{analytics.overview.totalPermissions}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <CheckCircle className="h-8 w-8 text-green-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Active Users</p>
              <p className="text-2xl font-bold text-gray-900">{analytics.overview.activeUsers}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <AlertTriangle className="h-8 w-8 text-orange-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Inactive Users</p>
              <p className="text-2xl font-bold text-gray-900">{analytics.overview.inactiveUsers}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Security Insights */}
      {analytics.securityInsights.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 flex items-center">
              <Shield className="h-5 w-5 mr-2" />
              Security Insights
            </h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {analytics.securityInsights.slice(0, 5).map((insight, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg border-l-4 ${
                    insight.type === 'error' ? 'border-red-500 bg-red-50' :
                    insight.type === 'warning' ? 'border-yellow-500 bg-yellow-50' :
                    insight.type === 'success' ? 'border-green-500 bg-green-50' :
                    'border-blue-500 bg-blue-50'
                  }`}
                >
                  <div className="flex items-start">
                    {getInsightIcon(insight.type)}
                    <div className="ml-3 flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-gray-900">{insight.title}</h4>
                        <div className="flex items-center space-x-2">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getInsightBadgeColor(insight.severity)}`}>
                            {insight.severity}
                          </span>
                          {insight.count && (
                            <span className="text-sm text-gray-600">({insight.count})</span>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{insight.description}</p>
                      {insight.actionRequired && (
                        <div className="mt-2">
                          <span className="inline-flex items-center text-xs text-orange-600">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Action Required
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Role Distribution */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 flex items-center">
              <PieChart className="h-5 w-5 mr-2" />
              Role Distribution
            </h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {analytics.roleDistribution.map((role) => (
                <div key={role.template} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-4 h-4 bg-blue-600 rounded"></div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {role.template.replace('_', ' ')}
                      </div>
                      <div className="text-xs text-gray-500">
                        {role.userCount} users ({role.percentage.toFixed(1)}%)
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getTrendIcon(role.trend)}
                    <span className={`text-sm ${
                      role.trend === 'up' ? 'text-green-600' :
                      role.trend === 'down' ? 'text-red-600' :
                      'text-gray-600'
                    }`}>
                      {role.change > 0 ? '+' : ''}{role.change}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* User Type Breakdown */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 flex items-center">
              <Users className="h-5 w-5 mr-2" />
              User Type Breakdown
            </h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {analytics.userTypeBreakdown.map((userType) => (
                <div key={userType.userType}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-900">
                      {userType.userType.replace('_', ' ')}
                    </span>
                    <span className="text-sm text-gray-600">
                      {userType.count} ({userType.percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${userType.percentage}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>{userType.activeCount} active</span>
                    <span>Avg {userType.averagePermissions} permissions</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Permission Usage & Restaurant Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Permissions */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 flex items-center">
              <Key className="h-5 w-5 mr-2" />
              Top Permissions
            </h3>
          </div>
          <div className="p-6">
            <div className="space-y-3">
              {analytics.permissionUsage.slice(0, 8).map((permission) => (
                <div key={permission.permission} className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900">
                      {permission.permission}
                    </div>
                    <div className="text-xs text-gray-500">
                      {permission.category} • {permission.userCount} users
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-gray-900">
                      {permission.utilizationRate.toFixed(1)}%
                    </div>
                    <div className="text-xs text-gray-500">
                      {permission.roleCount} roles
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Restaurant Analytics */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 flex items-center">
              <Building2 className="h-5 w-5 mr-2" />
              Restaurant Analytics
            </h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {analytics.restaurantAnalytics.slice(0, 5).map((restaurant) => (
                <div key={restaurant.restaurantId} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-gray-900">
                      {restaurant.restaurantName}
                    </h4>
                    <span className="text-xs text-gray-500">
                      {new Date(restaurant.lastActivity).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-lg font-bold text-blue-600">{restaurant.userCount}</div>
                      <div className="text-xs text-gray-500">Users</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-purple-600">{restaurant.roleCount}</div>
                      <div className="text-xs text-gray-500">Roles</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-green-600">{restaurant.permissionCount}</div>
                      <div className="text-xs text-gray-500">Permissions</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Trends Chart */}
      {analytics.trends.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 flex items-center">
              <TrendingUp className="h-5 w-5 mr-2" />
              Activity Trends
            </h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {analytics.trends.map((trend, index) => (
                <div key={index} className="text-center p-4 border border-gray-200 rounded-lg">
                  <div className="text-xs text-gray-500 mb-2">{trend.period}</div>
                  <div className="space-y-1">
                    <div className="text-sm">
                      <span className="text-green-600">+{trend.newRoles}</span>
                      <span className="text-gray-500 text-xs ml-1">roles</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-red-600">-{trend.removedRoles}</span>
                      <span className="text-gray-500 text-xs ml-1">removed</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-blue-600">{trend.permissionChanges}</span>
                      <span className="text-gray-500 text-xs ml-1">changes</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}